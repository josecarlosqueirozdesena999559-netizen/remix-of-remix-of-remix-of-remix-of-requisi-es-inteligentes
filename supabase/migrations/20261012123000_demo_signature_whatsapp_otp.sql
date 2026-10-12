-- Replace the demo signature's Google Authenticator/TOTP confirmation with a
-- WhatsApp authentication-template OTP. The feature remains demo-account-only.

ALTER TABLE public.document_signatures
  ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz;
ALTER TABLE public.document_signatures
  ALTER COLUMN totp_verified_at DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.demo_signature_otps (
  signature_request_id uuid PRIMARY KEY
    REFERENCES public.demo_signature_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview_sha256 text NOT NULL CHECK (preview_sha256 ~ '^[0-9a-f]{64}$'),
  otp_hash text CHECK (otp_hash IS NULL OR otp_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR otp_hash IS NULL)
);

CREATE INDEX IF NOT EXISTS demo_signature_otps_user_expires_idx
  ON public.demo_signature_otps (user_id, expires_at DESC);

ALTER TABLE public.demo_signature_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.demo_signature_otps FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.demo_signature_otps TO service_role;

ALTER TABLE public.signature_audit_logs
  DROP CONSTRAINT IF EXISTS signature_audit_logs_event_type_check;
ALTER TABLE public.signature_audit_logs
  ADD CONSTRAINT signature_audit_logs_event_type_check
  CHECK (event_type IN (
    'SIGNATURE_SAVED', 'TOTP_ENABLED', 'DOCUMENT_OPENED', 'SIGN_REQUESTED',
    'TOTP_VERIFIED', 'SIGN_CONFIRMED', 'PDF_GENERATED', 'SIGN_COMPLETED',
    'SIGN_FAILED', 'SIGN_CANCELLED', 'PREVIEW_REVIEWED',
    'WHATSAPP_OTP_SENT', 'WHATSAPP_OTP_FAILED', 'WHATSAPP_OTP_VERIFIED'
  ));

-- Permit a separately rate-limited OTP-send action while keeping the existing
-- server-only rolling-window limiter as the enforcement point.
ALTER TABLE public.demo_signature_rate_limits
  DROP CONSTRAINT IF EXISTS demo_signature_rate_limits_action_check;
ALTER TABLE public.demo_signature_rate_limits
  ADD CONSTRAINT demo_signature_rate_limits_action_check
  CHECK (action IN (
    'status', 'save_signature', 'totp_enabled', 'begin_signature',
    'preview_signature', 'confirm_preview', 'cancel_signature',
    'send_signature_otp', 'complete_signature'
  ));

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
       'preview_signature', 'confirm_preview', 'cancel_signature',
       'send_signature_otp', 'complete_signature'
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

-- Increment and persist failed-attempt counters without rolling them back.
-- The HMAC is computed in the Edge Function with a server-only key.
CREATE OR REPLACE FUNCTION public.verify_demo_signature_otp(
  p_signature_request_id uuid,
  p_user_id uuid,
  p_preview_sha256 text,
  p_otp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp public.demo_signature_otps%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_signature_request_id IS NULL
     OR p_user_id IS NULL
     OR p_preview_sha256 IS NULL OR p_preview_sha256 !~ '^[0-9a-f]{64}$'
     OR p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_OTP_PARAMETERS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_otp
  FROM public.demo_signature_otps
  WHERE signature_request_id = p_signature_request_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_otp.otp_hash IS NULL
     OR v_otp.consumed_at IS NOT NULL
     OR v_otp.expires_at <= v_now
     OR v_otp.preview_sha256 IS DISTINCT FROM p_preview_sha256
     OR v_otp.attempt_count >= 5 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.demo_signature_otps
  SET attempt_count = attempt_count + 1,
      verified_at = CASE WHEN otp_hash = p_otp_hash THEN v_now ELSE verified_at END
  WHERE signature_request_id = p_signature_request_id
    AND user_id = p_user_id;

  IF v_otp.otp_hash IS DISTINCT FROM p_otp_hash THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'verified_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.verify_demo_signature_otp(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_demo_signature_otp(uuid, uuid, text, text)
  TO service_role;

-- Every completion path must consume a matching OTP bound to this user's exact
-- reviewed PDF preview. This also blocks the old TOTP-only completion routine.
CREATE OR REPLACE FUNCTION public.require_consumed_demo_signature_otp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status
     AND NOT EXISTS (
       SELECT 1
       FROM public.demo_signature_otps otp
       WHERE otp.signature_request_id = NEW.id
         AND otp.user_id = NEW.user_id
         AND otp.preview_sha256 = NEW.preview_sha256
         AND otp.consumed_at IS NOT NULL
         AND otp.otp_hash IS NULL
     ) THEN
    RAISE EXCEPTION 'WHATSAPP_OTP_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_consumed_demo_signature_otp
  ON public.demo_signature_requests;
CREATE TRIGGER trg_require_consumed_demo_signature_otp
BEFORE UPDATE OF status ON public.demo_signature_requests
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION public.require_consumed_demo_signature_otp();

REVOKE ALL ON FUNCTION public.require_consumed_demo_signature_otp()
  FROM PUBLIC, anon, authenticated, service_role;

-- Retire the TOTP-only RPC after the database-level completion guard is in place.
REVOKE ALL ON FUNCTION public.complete_demo_signature(uuid, uuid, bigint, timestamptz, text, text, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_demo_signature_with_otp(
  p_signature_request_id uuid,
  p_user_id uuid,
  p_otp_hash text,
  p_signed_storage_key text,
  p_final_sha256 text,
  p_signed_at timestamptz,
  p_ip_address text,
  p_session_id text,
  p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.demo_signature_requests%ROWTYPE;
  v_request public.requisicoes%ROWTYPE;
  v_profile public.usuarios%ROWTYPE;
  v_otp public.demo_signature_otps%ROWTYPE;
  v_signed_file jsonb;
  v_signed_parts jsonb;
  v_outputs jsonb;
  v_signature_id uuid;
  v_new_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_signature_request_id IS NULL
     OR p_user_id IS NULL
     OR p_otp_hash IS NULL OR p_otp_hash !~ '^[0-9a-f]{64}$'
     OR p_signed_storage_key IS NULL
     OR p_final_sha256 IS NULL OR p_final_sha256 !~ '^[0-9a-f]{64}$'
     OR p_signed_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_SIGNATURE_PARAMETERS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_intent
  FROM public.demo_signature_requests
  WHERE id = p_signature_request_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_intent.status <> 'pending' OR v_intent.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'SIGNATURE_REQUEST_EXPIRED_OR_USED' USING ERRCODE = 'P0001';
  END IF;
  IF v_intent.preview_reviewed_at IS NULL
     OR v_intent.preview_sha256 IS NULL
     OR v_intent.preview_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PREVIEW_CONFIRMATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_otp
  FROM public.demo_signature_otps
  WHERE signature_request_id = p_signature_request_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_otp.otp_hash IS DISTINCT FROM p_otp_hash
     OR v_otp.preview_sha256 IS DISTINCT FROM v_intent.preview_sha256
     OR v_otp.expires_at <= clock_timestamp()
     OR v_otp.verified_at IS NULL
     OR v_otp.verified_at > v_otp.expires_at
     OR v_otp.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'WHATSAPP_OTP_INVALID_OR_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_profile
  FROM public.usuarios
  WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
    AND auth_user_id = p_user_id
    AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.requisicoes
  WHERE id = v_intent.requisicao_id
  FOR UPDATE;
  IF NOT FOUND
     OR lower(trim(coalesce(v_request.solicitante, ''))) <> lower(trim(v_profile.nome))
     OR lower(trim(coalesce(v_request.setor, ''))) <> lower(trim(coalesce(v_profile.unidade_nome, v_profile.setor, ''))) THEN
    RAISE EXCEPTION 'REQUEST_NOT_OWNED_BY_DEMO_USER' USING ERRCODE = '42501';
  END IF;

  IF split_part(v_intent.document_version, '/', 1)::timestamptz
       IS DISTINCT FROM coalesce(v_request.updated_at, v_request.created_at) THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_CHANGED' USING ERRCODE = 'P0001';
  END IF;
  IF v_intent.document_stage = 'request'
     AND v_request.status NOT IN ('aguardando_assinatura', 'aguardando_assinatura_requisicao', 'correcao_requisicao') THEN
    RAISE EXCEPTION 'REQUEST_NO_LONGER_AWAITS_SIGNATURE' USING ERRCODE = 'P0001';
  ELSIF v_intent.document_stage = 'output'
     AND (v_request.status <> 'aguardando_assinatura_saida' OR v_request.admin_attachment IS NULL) THEN
    RAISE EXCEPTION 'OUTPUT_NO_LONGER_AWAITS_SIGNATURE' USING ERRCODE = 'P0001';
  END IF;

  IF p_signed_storage_key NOT LIKE 'requisicoes-assinadas/' || v_request.id::text || '/%' THEN
    RAISE EXCEPTION 'INVALID_SIGNED_DOCUMENT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.demo_signature_otps
  SET otp_hash = NULL,
      consumed_at = clock_timestamp()
  WHERE signature_request_id = p_signature_request_id
    AND user_id = p_user_id
    AND otp_hash = p_otp_hash
    AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WHATSAPP_OTP_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  v_signed_file := jsonb_build_object(
    'fileName', split_part(p_signed_storage_key, '/', 3),
    'storageBucket', 'requisicoes',
    'storagePath', p_signed_storage_key,
    'uploadedAt', p_signed_at,
    'kind', CASE WHEN v_intent.document_stage = 'output' THEN 'output' ELSE 'request' END
  );
  v_signed_parts := CASE
    WHEN jsonb_typeof(v_request.signed_attachment) = 'object' THEN v_request.signed_attachment
    ELSE '{}'::jsonb
  END;
  v_outputs := CASE
    WHEN jsonb_typeof(v_signed_parts -> 'outputs') = 'array' THEN v_signed_parts -> 'outputs'
    ELSE '[]'::jsonb
  END;

  IF v_intent.document_stage = 'output' THEN
    v_outputs := v_outputs || jsonb_build_array(v_signed_file);
    v_signed_parts := jsonb_build_object(
      'request', v_signed_parts -> 'request',
      'output', v_signed_file,
      'outputs', v_outputs
    );
    v_new_status := 'concluido';
    UPDATE public.requisicoes
    SET signed_attachment = v_signed_parts,
        admin_attachment = NULL,
        status = v_new_status,
        updated_at = p_signed_at
    WHERE id = v_request.id;
  ELSE
    v_signed_parts := jsonb_build_object(
      'request', v_signed_file,
      'output', v_signed_parts -> 'output',
      'outputs', v_outputs
    );
    v_new_status := 'recebido';
    UPDATE public.requisicoes
    SET signed_attachment = v_signed_parts,
        status = v_new_status,
        updated_at = p_signed_at
    WHERE id = v_request.id;
  END IF;

  INSERT INTO public.document_signatures (
    document_id, document_version, user_id, signer_name, signature_request_id,
    original_sha256, signed_pdf_sha256, signed_storage_key, signed_at,
    totp_verified_at, otp_verified_at, consent_at, authentication_method,
    ip_address, session_id, user_agent
  ) VALUES (
    v_request.id, v_intent.document_version, p_user_id, v_profile.nome, v_intent.id,
    v_intent.original_sha256, p_final_sha256, p_signed_storage_key, p_signed_at,
    NULL, v_otp.verified_at, v_intent.consent_at, 'LOGIN + WHATSAPP OTP',
    p_ip_address, p_session_id, p_user_agent
  ) RETURNING id INTO v_signature_id;

  UPDATE public.demo_signature_requests
  SET status = 'completed',
      signed_storage_key = p_signed_storage_key,
      final_sha256 = p_final_sha256,
      completed_at = p_signed_at
  WHERE id = v_intent.id;

  INSERT INTO public.signature_audit_logs (
    signature_id, signature_request_id, user_id, event_type, ip_address, user_agent, metadata
  ) VALUES
    (v_signature_id, v_intent.id, p_user_id, 'WHATSAPP_OTP_VERIFIED', p_ip_address, p_user_agent,
     jsonb_build_object('method', 'whatsapp_authentication_template', 'verified_at', v_otp.verified_at)),
    (v_signature_id, v_intent.id, p_user_id, 'SIGN_CONFIRMED', p_ip_address, p_user_agent,
     jsonb_build_object('document_id', v_request.id, 'consent_at', v_intent.consent_at)),
    (v_signature_id, v_intent.id, p_user_id, 'PDF_GENERATED', p_ip_address, p_user_agent,
     jsonb_build_object('original_sha256', v_intent.original_sha256, 'final_sha256', p_final_sha256)),
    (v_signature_id, v_intent.id, p_user_id, 'SIGN_COMPLETED', p_ip_address, p_user_agent,
     jsonb_build_object('document_stage', v_intent.document_stage, 'status', v_new_status));

  RETURN jsonb_build_object(
    'ok', true,
    'signature_id', v_signature_id,
    'document_id', v_request.id,
    'status', v_new_status,
    'signed_at', p_signed_at,
    'original_sha256', v_intent.original_sha256,
    'signed_pdf_sha256', p_final_sha256
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_demo_signature_with_otp(uuid, uuid, text, text, text, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_demo_signature_with_otp(uuid, uuid, text, text, text, timestamptz, text, text, text)
  TO service_role;
