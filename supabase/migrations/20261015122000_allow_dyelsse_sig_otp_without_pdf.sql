-- Allow Dyelsse to digitally sign the SIG output using a system-generated PDF when no file is attached.
-- The existing OTP, ownership, version and preview-review checks remain enforced.
REVOKE ALL ON FUNCTION public.complete_demo_signature_with_otp(uuid, uuid, text, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
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
  WHERE lower(trim(coalesce(usuario, ''))) = 'dyelssehospital'
    AND upper(trim(coalesce(nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
    AND lower(trim(coalesce(setor, ''))) = 'hospital'
    AND lower(trim(coalesce(unidade_nome, ''))) = 'hospital';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DYELSSE_HOSPITAL_USER_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.requisicoes
  WHERE id = v_intent.requisicao_id
  FOR UPDATE;
  IF NOT FOUND
     OR lower(trim(coalesce(v_request.solicitante, ''))) <> lower(trim(v_profile.nome))
     OR lower(trim(coalesce(v_request.setor, ''))) <> lower(trim(coalesce(v_profile.unidade_nome, v_profile.setor, ''))) THEN
    RAISE EXCEPTION 'REQUEST_NOT_OWNED_BY_DYELSSE_HOSPITAL' USING ERRCODE = '42501';
  END IF;

  IF split_part(v_intent.document_version, '/', 1)::timestamptz
       IS DISTINCT FROM coalesce(v_request.updated_at, v_request.created_at) THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_CHANGED' USING ERRCODE = 'P0001';
  END IF;
  IF v_intent.document_stage = 'request'
     AND v_request.status NOT IN ('aguardando_assinatura', 'aguardando_assinatura_requisicao', 'correcao_requisicao') THEN
    RAISE EXCEPTION 'REQUEST_NO_LONGER_AWAITS_SIGNATURE' USING ERRCODE = 'P0001';
  ELSIF v_intent.document_stage = 'output'
     AND v_request.status <> 'aguardando_assinatura_saida' THEN
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

GRANT EXECUTE ON FUNCTION public.complete_demo_signature_with_otp(uuid, uuid, text, text, text, timestamptz, text, text, text) TO service_role;
