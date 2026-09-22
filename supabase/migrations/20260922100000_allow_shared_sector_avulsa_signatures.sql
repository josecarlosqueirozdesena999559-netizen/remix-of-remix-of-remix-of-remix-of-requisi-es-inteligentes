-- Let shared sector logins see and sign avulsa documents for users linked to their sector.
CREATE OR REPLACE FUNCTION public.can_shared_sector_access_avulsa_signature(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = target_user_id
      AND public.can_shared_sector_read_user(u.id, u.setor, u.unidade_nome, u.usuario, u.funcao)
  )
$$;

REVOKE ALL ON FUNCTION public.can_shared_sector_access_avulsa_signature(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_shared_sector_access_avulsa_signature(uuid) TO authenticated;

DROP POLICY IF EXISTS "Shared sector login can read linked avulsa signatures" ON public.assinaturas_avulsas;
CREATE POLICY "Shared sector login can read linked avulsa signatures"
ON public.assinaturas_avulsas
FOR SELECT
TO authenticated
USING (public.can_shared_sector_access_avulsa_signature(usuario_id));

DROP POLICY IF EXISTS "Shared sector login can update linked avulsa signatures" ON public.assinaturas_avulsas;
CREATE POLICY "Shared sector login can update linked avulsa signatures"
ON public.assinaturas_avulsas
FOR UPDATE
TO authenticated
USING (public.can_shared_sector_access_avulsa_signature(usuario_id))
WITH CHECK (
  public.can_shared_sector_access_avulsa_signature(usuario_id)
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
        OR public.can_shared_sector_access_avulsa_signature(a.usuario_id)
      )
  )
$$;
