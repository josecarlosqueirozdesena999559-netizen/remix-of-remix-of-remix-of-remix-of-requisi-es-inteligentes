-- Demo-only electronic signature support for the dedicated test account.
-- Does not enable signature/TOTP flows for any other profile.

CREATE TABLE IF NOT EXISTS public.demo_user_signatures (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  signature_sha256 text NOT NULL CHECK (signature_sha256 ~ '^[0-9a-f]{64}$'),
  last_accepted_step bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demo_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requisicao_id uuid NOT NULL REFERENCES public.requisicoes(id) ON DELETE CASCADE,
  document_stage text NOT NULL CHECK (document_stage IN ('request', 'output')),
  document_version text NOT NULL,
  original_sha256 text NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_storage_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'expired', 'failed')),
  consent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  signed_storage_key text,
  final_sha256 text CHECK (final_sha256 IS NULL OR final_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS demo_signature_requests_user_created_idx
  ON public.demo_signature_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_signature_requests_document_idx
  ON public.demo_signature_requests (requisicao_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.requisicoes(id) ON DELETE RESTRICT,
  document_version text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signer_name text NOT NULL,
  signature_request_id uuid NOT NULL UNIQUE REFERENCES public.demo_signature_requests(id) ON DELETE RESTRICT,
  original_sha256 text NOT NULL CHECK (original_sha256 ~ '^[0-9a-f]{64}$'),
  signed_pdf_sha256 text NOT NULL CHECK (signed_pdf_sha256 ~ '^[0-9a-f]{64}$'),
  signed_storage_key text NOT NULL UNIQUE,
  signed_at timestamptz NOT NULL,
  totp_verified_at timestamptz NOT NULL,
  consent_at timestamptz NOT NULL,
  authentication_method text NOT NULL DEFAULT 'LOGIN + TOTP',
  ip_address text,
  session_id text,
  user_agent text,
  status text NOT NULL DEFAULT 'SIGNED' CHECK (status IN ('SIGNED', 'FAILED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_signatures_document_idx
  ON public.document_signatures (document_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS document_signatures_user_idx
  ON public.document_signatures (user_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS public.signature_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id uuid REFERENCES public.document_signatures(id) ON DELETE RESTRICT,
  -- Kept as an immutable historical identifier so deleting a pending intent never edits an audit row.
  signature_request_id uuid,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'SIGNATURE_SAVED', 'TOTP_ENABLED', 'DOCUMENT_OPENED', 'SIGN_REQUESTED',
    'TOTP_VERIFIED', 'SIGN_CONFIRMED', 'PDF_GENERATED', 'SIGN_COMPLETED',
    'SIGN_FAILED', 'SIGN_CANCELLED'
  )),
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signature_audit_logs_request_idx
  ON public.signature_audit_logs (signature_request_id, created_at);

ALTER TABLE public.demo_user_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.demo_user_signatures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.demo_signature_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.document_signatures FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.signature_audit_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.demo_user_signatures TO service_role;
GRANT ALL ON public.demo_signature_requests TO service_role;
GRANT ALL ON public.document_signatures TO service_role;
GRANT ALL ON public.signature_audit_logs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'demo-signature-private',
  'demo-signature-private',
  false,
  15728640,
  ARRAY['application/pdf', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['application/pdf', 'image/png']::text[];

-- No authenticated storage policies are intentionally created for this bucket.
-- Only the service-role Edge Function reads/writes signature assets and source/final PDFs.

CREATE OR REPLACE FUNCTION public.reject_demo_direct_signature_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_auth_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT auth_user_id
  INTO demo_auth_id
  FROM public.usuarios
  WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
    AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local'
  LIMIT 1;

  IF demo_auth_id IS NOT NULL
     AND auth.uid() = demo_auth_id
     AND (
       NEW.signed_attachment IS DISTINCT FROM OLD.signed_attachment
       OR (
         NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status IN ('recebido', 'concluido')
       )
     ) THEN
    RAISE EXCEPTION 'DEMO_SIGNATURE_BACKEND_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_demo_direct_signature_changes ON public.requisicoes;
CREATE TRIGGER trg_reject_demo_direct_signature_changes
BEFORE UPDATE ON public.requisicoes
FOR EACH ROW
EXECUTE FUNCTION public.reject_demo_direct_signature_changes();

REVOKE ALL ON FUNCTION public.reject_demo_direct_signature_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_demo_direct_signature_changes() TO service_role;

-- Restrictive policies prevent the demo user from bypassing the TOTP workflow by
-- uploading a file directly into the existing signed-document folders. Other users
-- and service-role functions retain the existing behavior.
DROP POLICY IF EXISTS "Block demo direct signed PDF uploads" ON storage.objects;
CREATE POLICY "Block demo direct signed PDF uploads"
ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (
  NOT (
    bucket_id = 'requisicoes'
    AND (name LIKE 'requisicoes-assinadas/%' OR name LIKE 'saidas-assinadas/%')
    AND auth.uid() = (
      SELECT auth_user_id FROM public.usuarios
      WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
        AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local'
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "Block demo direct signed PDF updates" ON storage.objects;
CREATE POLICY "Block demo direct signed PDF updates"
ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (
  NOT (
    bucket_id = 'requisicoes'
    AND (name LIKE 'requisicoes-assinadas/%' OR name LIKE 'saidas-assinadas/%')
    AND auth.uid() = (
      SELECT auth_user_id FROM public.usuarios
      WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
        AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local'
      LIMIT 1
    )
  )
)
WITH CHECK (
  NOT (
    bucket_id = 'requisicoes'
    AND (name LIKE 'requisicoes-assinadas/%' OR name LIKE 'saidas-assinadas/%')
    AND auth.uid() = (
      SELECT auth_user_id FROM public.usuarios
      WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
        AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local'
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "Block demo direct signed PDF deletions" ON storage.objects;
CREATE POLICY "Block demo direct signed PDF deletions"
ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated
USING (
  NOT (
    bucket_id = 'requisicoes'
    AND (name LIKE 'requisicoes-assinadas/%' OR name LIKE 'saidas-assinadas/%')
    AND auth.uid() = (
      SELECT auth_user_id FROM public.usuarios
      WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
        AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local'
      LIMIT 1
    )
  )
);

CREATE OR REPLACE FUNCTION public.complete_demo_signature(
  p_signature_request_id uuid,
  p_user_id uuid,
  p_totp_step bigint,
  p_totp_verified_at timestamptz,
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
  v_signed_file jsonb;
  v_signed_parts jsonb;
  v_outputs jsonb;
  v_signature_id uuid;
  v_new_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_intent
  FROM public.demo_signature_requests
  WHERE id = p_signature_request_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_intent.status <> 'pending' OR v_intent.expires_at <= now() THEN
    RAISE EXCEPTION 'SIGNATURE_REQUEST_EXPIRED_OR_USED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_profile
  FROM public.usuarios
  WHERE id = '34708484-8caa-456b-a423-9f91aeba52d8'::uuid
    AND auth_user_id = p_user_id
    AND lower(trim(email)) = 'demo.assinatura@usuarios.solicite.local';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEMO_USER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.demo_user_signatures
  SET last_accepted_step = p_totp_step,
      updated_at = now()
  WHERE user_id = p_user_id
    AND last_accepted_step < p_totp_step;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOTP_STEP_ALREADY_USED' USING ERRCODE = 'P0001';
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

  IF p_final_sha256 !~ '^[0-9a-f]{64}$'
     OR p_signed_storage_key NOT LIKE 'requisicoes-assinadas/' || v_request.id::text || '/%' THEN
    RAISE EXCEPTION 'INVALID_SIGNED_DOCUMENT' USING ERRCODE = '22023';
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
    totp_verified_at, consent_at, authentication_method, ip_address, session_id, user_agent
  ) VALUES (
    v_request.id, v_intent.document_version, p_user_id, v_profile.nome, v_intent.id,
    v_intent.original_sha256, p_final_sha256, p_signed_storage_key, p_signed_at,
    p_totp_verified_at, v_intent.consent_at, 'LOGIN + TOTP', p_ip_address, p_session_id, p_user_agent
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
    (v_signature_id, v_intent.id, p_user_id, 'TOTP_VERIFIED', p_ip_address, p_user_agent,
     jsonb_build_object('method', 'totp', 'step', p_totp_step)),
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

REVOKE ALL ON FUNCTION public.complete_demo_signature(uuid, uuid, bigint, timestamptz, text, text, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_demo_signature(uuid, uuid, bigint, timestamptz, text, text, timestamptz, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_signature_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'SIGNATURE_AUDIT_IS_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_signature_audit_update ON public.signature_audit_logs;
CREATE TRIGGER trg_prevent_signature_audit_update
BEFORE UPDATE OR DELETE ON public.signature_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_signature_audit_mutation();

REVOKE ALL ON FUNCTION public.prevent_signature_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;
