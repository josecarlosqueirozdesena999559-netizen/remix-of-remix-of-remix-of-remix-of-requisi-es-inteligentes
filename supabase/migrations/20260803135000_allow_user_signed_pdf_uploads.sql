CREATE OR REPLACE FUNCTION public.user_owns_requisicao_storage_path(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requisicoes r
    JOIN public.usuarios u
      ON (
        u.auth_user_id = auth.uid()
        OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
    WHERE split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND r.id = split_part(object_name, '/', 2)::uuid
      AND (
        u.is_admin = true
        OR (
          u.cpf IS NOT NULL
          AND u.cpf = r.solicitante_cpf
        )
        OR (
          u.cpf IS NULL
          AND lower(NULLIF(BTRIM(u.nome), '')) = lower(NULLIF(BTRIM(r.solicitante), ''))
          AND lower(
            COALESCE(
              NULLIF(BTRIM(u.unidade_nome), ''),
              NULLIF(BTRIM(u.setor), '')
            )
          ) = lower(COALESCE(NULLIF(BTRIM(r.setor), ''), ''))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_document_upload_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  uploader_id uuid := auth.uid();
  quota_claimed boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.bucket_id <> 'requisicoes' THEN
    RETURN NEW;
  END IF;

  IF uploader_id IS NOT NULL
    AND (
      NEW.name LIKE 'requisicoes-assinadas/%'
      OR NEW.name LIKE 'saidas-assinadas/%'
    )
    AND public.user_owns_requisicao_storage_path(NEW.name)
  THEN
    RETURN NEW;
  END IF;

  IF NEW.name NOT LIKE 'saidas/%'
    OR uploader_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.usuarios
      WHERE auth_user_id = uploader_id
        AND is_admin = true
    )
  THEN
    RAISE EXCEPTION 'DOCUMENT_UPLOADS_DISABLED';
  END IF;

  UPDATE public.document_upload_quota
  SET
    admin_output_upload_consumed = true,
    consumed_at = now(),
    consumed_by = uploader_id
  WHERE id = true
    AND admin_output_upload_consumed = false
  RETURNING true INTO quota_claimed;

  IF quota_claimed IS NOT TRUE THEN
    RAISE EXCEPTION 'DOCUMENT_UPLOAD_LIMIT_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can upload own signed requisicoes files" ON storage.objects;
CREATE POLICY "Users can upload own signed requisicoes files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'requisicoes'
  AND (
    name LIKE 'requisicoes-assinadas/%'
    OR name LIKE 'saidas-assinadas/%'
  )
  AND public.user_owns_requisicao_storage_path(name)
);

DROP POLICY IF EXISTS "Users can update own signed requisicoes files" ON storage.objects;
CREATE POLICY "Users can update own signed requisicoes files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'requisicoes'
  AND (
    name LIKE 'requisicoes-assinadas/%'
    OR name LIKE 'saidas-assinadas/%'
  )
  AND public.user_owns_requisicao_storage_path(name)
)
WITH CHECK (
  bucket_id = 'requisicoes'
  AND (
    name LIKE 'requisicoes-assinadas/%'
    OR name LIKE 'saidas-assinadas/%'
  )
  AND public.user_owns_requisicao_storage_path(name)
);

