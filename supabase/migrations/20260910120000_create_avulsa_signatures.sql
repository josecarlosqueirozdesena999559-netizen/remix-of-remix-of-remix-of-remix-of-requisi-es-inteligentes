CREATE TABLE IF NOT EXISTS public.assinaturas_avulsas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  solicitante text NOT NULL,
  solicitante_cpf text,
  setor text,
  titulo text NOT NULL,
  observacao text,
  status text NOT NULL DEFAULT 'aguardando_assinatura',
  admin_attachment jsonb NOT NULL,
  signed_attachment jsonb,
  return_reason text,
  returned_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  signed_at timestamptz
);

CREATE INDEX IF NOT EXISTS assinaturas_avulsas_usuario_status_idx
  ON public.assinaturas_avulsas (usuario_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS assinaturas_avulsas_status_updated_idx
  ON public.assinaturas_avulsas (status, updated_at DESC);

ALTER TABLE public.assinaturas_avulsas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_assinaturas_avulsas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_assinaturas_avulsas_updated_at_trigger ON public.assinaturas_avulsas;
CREATE TRIGGER touch_assinaturas_avulsas_updated_at_trigger
BEFORE UPDATE ON public.assinaturas_avulsas
FOR EACH ROW
EXECUTE FUNCTION public.touch_assinaturas_avulsas_updated_at();

CREATE OR REPLACE FUNCTION public.current_usuario_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
     OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  ORDER BY u.updated_at DESC NULLS LAST, u.created_at DESC NULLS LAST
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE (u.auth_user_id = auth.uid()
       OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', '')))
      AND u.is_admin = true
  )
$$;

DROP POLICY IF EXISTS "Admins can manage assinaturas avulsas" ON public.assinaturas_avulsas;
CREATE POLICY "Admins can manage assinaturas avulsas"
ON public.assinaturas_avulsas
FOR ALL
TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS "Users can read own assinaturas avulsas" ON public.assinaturas_avulsas;
CREATE POLICY "Users can read own assinaturas avulsas"
ON public.assinaturas_avulsas
FOR SELECT
TO authenticated
USING (usuario_id = public.current_usuario_id());

DROP POLICY IF EXISTS "Users can update own assinaturas avulsas" ON public.assinaturas_avulsas;
CREATE POLICY "Users can update own assinaturas avulsas"
ON public.assinaturas_avulsas
FOR UPDATE
TO authenticated
USING (usuario_id = public.current_usuario_id())
WITH CHECK (
  usuario_id = public.current_usuario_id()
  AND status IN ('aguardando_assinatura', 'assinado', 'devolvido')
);

CREATE OR REPLACE FUNCTION public.user_owns_assinatura_avulsa_storage_path(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assinaturas_avulsas a
    WHERE split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND a.id = split_part(object_name, '/', 2)::uuid
      AND (
        public.current_user_is_admin()
        OR a.usuario_id = public.current_usuario_id()
      )
  )
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

  IF uploader_id IS NOT NULL
    AND NEW.name LIKE 'assinaturas-avulsas-assinadas/%'
    AND public.user_owns_assinatura_avulsa_storage_path(NEW.name)
  THEN
    RETURN NEW;
  END IF;

  IF uploader_id IS NOT NULL
    AND NEW.name LIKE 'assinaturas-avulsas/%'
    AND public.current_user_is_admin()
  THEN
    RETURN NEW;
  END IF;

  IF NEW.name NOT LIKE 'saidas/%'
    OR uploader_id IS NULL
    OR NOT public.current_user_is_admin()
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

DROP POLICY IF EXISTS "Admins can upload unsigned avulsa files" ON storage.objects;
CREATE POLICY "Admins can upload unsigned avulsa files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'requisicoes'
  AND name LIKE 'assinaturas-avulsas/%'
  AND public.current_user_is_admin()
);

DROP POLICY IF EXISTS "Users can upload own signed avulsa files" ON storage.objects;
CREATE POLICY "Users can upload own signed avulsa files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'requisicoes'
  AND name LIKE 'assinaturas-avulsas-assinadas/%'
  AND public.user_owns_assinatura_avulsa_storage_path(name)
);

DROP POLICY IF EXISTS "Users can update own signed avulsa files" ON storage.objects;
CREATE POLICY "Users can update own signed avulsa files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'requisicoes'
  AND name LIKE 'assinaturas-avulsas-assinadas/%'
  AND public.user_owns_assinatura_avulsa_storage_path(name)
)
WITH CHECK (
  bucket_id = 'requisicoes'
  AND name LIKE 'assinaturas-avulsas-assinadas/%'
  AND public.user_owns_assinatura_avulsa_storage_path(name)
);
