CREATE OR REPLACE FUNCTION public.current_user_is_hospital_shared_login()
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
      AND (
        public.normalize_shared_sector_text(u.usuario) = 'hospital'
        OR public.normalize_shared_sector_text(u.funcao) = 'login compartilhado'
      )
      AND (
        public.normalize_shared_sector_text(u.setor) = 'hospital'
        OR public.normalize_shared_sector_text(u.unidade_nome) = 'hospital'
      )
  )
$$;

DROP POLICY IF EXISTS "Hospital shared login can read Dyelsse AV-00001" ON public.assinaturas_avulsas;
CREATE POLICY "Hospital shared login can read Dyelsse AV-00001"
ON public.assinaturas_avulsas
FOR SELECT
TO authenticated
USING (
  id = '95a13df0-995c-4a14-b080-8f6affb1adc1'::uuid
  AND solicitante_cpf = '06852185389'
  AND public.current_user_is_hospital_shared_login()
);

DROP POLICY IF EXISTS "Hospital shared login can update Dyelsse AV-00001" ON public.assinaturas_avulsas;
CREATE POLICY "Hospital shared login can update Dyelsse AV-00001"
ON public.assinaturas_avulsas
FOR UPDATE
TO authenticated
USING (
  id = '95a13df0-995c-4a14-b080-8f6affb1adc1'::uuid
  AND solicitante_cpf = '06852185389'
  AND public.current_user_is_hospital_shared_login()
)
WITH CHECK (
  id = '95a13df0-995c-4a14-b080-8f6affb1adc1'::uuid
  AND solicitante_cpf = '06852185389'
  AND public.current_user_is_hospital_shared_login()
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
        OR (
          a.id = '95a13df0-995c-4a14-b080-8f6affb1adc1'::uuid
          AND a.solicitante_cpf = '06852185389'
          AND public.current_user_is_hospital_shared_login()
        )
      )
  )
$$;