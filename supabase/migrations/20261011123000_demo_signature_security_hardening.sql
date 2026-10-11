-- Security hardening for the demo-only electronic-signature workflow.
-- The signature/TOTP flow remains restricted to the existing demo account.

ALTER TABLE public.demo_signature_requests
  ADD COLUMN IF NOT EXISTS preview_sha256 text,
  ADD COLUMN IF NOT EXISTS preview_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.demo_signature_requests'::regclass
      AND conname = 'demo_signature_requests_preview_sha256_check'
  ) THEN
    ALTER TABLE public.demo_signature_requests
      ADD CONSTRAINT demo_signature_requests_preview_sha256_check
      CHECK (preview_sha256 IS NULL OR preview_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END;
$$;

ALTER TABLE public.signature_audit_logs
  DROP CONSTRAINT IF EXISTS signature_audit_logs_event_type_check;
ALTER TABLE public.signature_audit_logs
  ADD CONSTRAINT signature_audit_logs_event_type_check
  CHECK (event_type IN (
    'SIGNATURE_SAVED', 'TOTP_ENABLED', 'DOCUMENT_OPENED', 'SIGN_REQUESTED',
    'TOTP_VERIFIED', 'SIGN_CONFIRMED', 'PDF_GENERATED', 'SIGN_COMPLETED',
    'SIGN_FAILED', 'SIGN_CANCELLED', 'PREVIEW_REVIEWED'
  ));

-- Prevent mutation through UPDATE, DELETE, and TRUNCATE, including service-role SQL.
CREATE OR REPLACE FUNCTION public.prevent_signature_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'SIGNATURE_AUDIT_IS_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_signature_audit_update ON public.signature_audit_logs;
CREATE TRIGGER trg_prevent_signature_audit_update
BEFORE UPDATE OR DELETE ON public.signature_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_signature_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_signature_audit_truncate ON public.signature_audit_logs;
CREATE TRIGGER trg_prevent_signature_audit_truncate
BEFORE TRUNCATE ON public.signature_audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_signature_audit_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON public.signature_audit_logs
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.signature_audit_logs TO service_role;
REVOKE ALL ON FUNCTION public.prevent_signature_audit_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

-- Server-only rolling-window limiter, keyed by the authenticated user and action.
CREATE TABLE IF NOT EXISTS public.demo_signature_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, window_start),
  CHECK (action IN (
    'status', 'save_signature', 'totp_enabled', 'begin_signature',
    'preview_signature', 'confirm_preview', 'cancel_signature', 'complete_signature'
  ))
);
ALTER TABLE public.demo_signature_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_signature_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_demo_signature_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_attempt_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL
     OR p_action IS NULL
     OR p_limit IS NULL
     OR p_window_seconds IS NULL
     OR p_action NOT IN (
       'status', 'save_signature', 'totp_enabled', 'begin_signature',
       'preview_signature', 'confirm_preview', 'cancel_signature', 'complete_signature'
     )
     OR p_limit < 1 OR p_limit > 60
     OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_PARAMETERS' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  DELETE FROM public.demo_signature_rate_limits
  WHERE user_id = p_user_id
    AND window_start < clock_timestamp() - interval '2 days';

  INSERT INTO public.demo_signature_rate_limits (user_id, action, window_start, attempt_count, updated_at)
  VALUES (p_user_id, p_action, v_window_start, 1, clock_timestamp())
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET
    attempt_count = public.demo_signature_rate_limits.attempt_count + 1,
    updated_at = clock_timestamp()
  RETURNING attempt_count INTO v_attempt_count;

  IF v_attempt_count > p_limit THEN
    RAISE EXCEPTION 'SIGNATURE_RATE_LIMITED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_demo_signature_rate_limit(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_demo_signature_rate_limit(uuid, text, integer, integer)
  TO service_role;

-- The Edge Function verifies the private preview's hash before calling this RPC.
-- Locking the pending intent makes acknowledgement idempotent and audit-atomic.
CREATE OR REPLACE FUNCTION public.confirm_demo_signature_preview(
  p_signature_request_id uuid,
  p_user_id uuid,
  p_preview_sha256 text,
  p_ip_address text,
  p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.demo_signature_requests%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_preview_sha256 IS NULL OR p_preview_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_PREVIEW_HASH' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_intent
  FROM public.demo_signature_requests
  WHERE id = p_signature_request_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_intent.status <> 'pending' OR v_intent.expires_at <= now() THEN
    RAISE EXCEPTION 'SIGNATURE_REQUEST_EXPIRED_OR_USED' USING ERRCODE = 'P0001';
  END IF;
  IF v_intent.preview_sha256 IS DISTINCT FROM p_preview_sha256 THEN
    RAISE EXCEPTION 'PREVIEW_HASH_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_intent.preview_reviewed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'preview_confirmed', true);
  END IF;

  UPDATE public.demo_signature_requests
  SET preview_reviewed_at = clock_timestamp()
  WHERE id = v_intent.id;

  INSERT INTO public.signature_audit_logs (
    signature_request_id, user_id, event_type, ip_address, user_agent, metadata
  ) VALUES (
    v_intent.id, p_user_id, 'PREVIEW_REVIEWED', p_ip_address, p_user_agent,
    jsonb_build_object(
      'document_id', v_intent.requisicao_id,
      'document_stage', v_intent.document_stage,
      'preview_sha256', p_preview_sha256
    )
  );

  RETURN jsonb_build_object('ok', true, 'preview_confirmed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_demo_signature_preview(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_demo_signature_preview(uuid, uuid, text, text, text)
  TO service_role;

-- A service-role completion RPC cannot mark a request complete unless its exact
-- preview has been recorded and the reviewer acknowledged it.
CREATE OR REPLACE FUNCTION public.require_reviewed_demo_signature_preview()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND (NEW.preview_reviewed_at IS NULL OR NEW.preview_sha256 IS NULL) THEN
    RAISE EXCEPTION 'PREVIEW_CONFIRMATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_reviewed_demo_signature_preview
  ON public.demo_signature_requests;
CREATE TRIGGER trg_require_reviewed_demo_signature_preview
BEFORE UPDATE OF status ON public.demo_signature_requests
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.require_reviewed_demo_signature_preview();

REVOKE ALL ON FUNCTION public.require_reviewed_demo_signature_preview()
  FROM PUBLIC, anon, authenticated, service_role;
