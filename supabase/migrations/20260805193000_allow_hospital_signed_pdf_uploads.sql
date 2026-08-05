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
          lower(trim(coalesce(u.usuario, ''))) = 'hospital'
          AND lower(
            coalesce(
              nullif(trim(u.setor), ''),
              nullif(trim(u.unidade_nome), ''),
              ''
            )
          ) = 'hospital'
          AND lower(trim(coalesce(r.setor, ''))) = 'hospital'
        )
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

