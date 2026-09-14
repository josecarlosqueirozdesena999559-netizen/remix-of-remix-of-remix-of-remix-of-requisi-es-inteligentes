DROP POLICY IF EXISTS "Users can read own requisicoes" ON public.requisicoes;
CREATE POLICY "Users can read own requisicoes"
ON public.requisicoes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE (
        u.auth_user_id = auth.uid()
        OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
      AND (
        u.is_admin = true
        OR (
          u.cpf IS NOT NULL
          AND u.cpf = requisicoes.solicitante_cpf
        )
        OR (
          u.cpf IS NULL
          AND lower(NULLIF(BTRIM(u.nome), '')) = lower(NULLIF(BTRIM(requisicoes.solicitante), ''))
          AND lower(
            COALESCE(
              NULLIF(BTRIM(u.unidade_nome), ''),
              NULLIF(BTRIM(u.setor), '')
            )
          ) = lower(COALESCE(NULLIF(BTRIM(requisicoes.setor), ''), ''))
        )
      )
  )
);

DROP POLICY IF EXISTS "Users can sign own requisicoes" ON public.requisicoes;
CREATE POLICY "Users can sign own requisicoes"
ON public.requisicoes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE (
        u.auth_user_id = auth.uid()
        OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
      AND (
        u.is_admin = true
        OR (
          u.cpf IS NOT NULL
          AND u.cpf = requisicoes.solicitante_cpf
        )
        OR (
          u.cpf IS NULL
          AND lower(NULLIF(BTRIM(u.nome), '')) = lower(NULLIF(BTRIM(requisicoes.solicitante), ''))
          AND lower(
            COALESCE(
              NULLIF(BTRIM(u.unidade_nome), ''),
              NULLIF(BTRIM(u.setor), '')
            )
          ) = lower(COALESCE(NULLIF(BTRIM(requisicoes.setor), ''), ''))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE (
        u.auth_user_id = auth.uid()
        OR lower(COALESCE(u.email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
      AND (
        u.is_admin = true
        OR (
          u.cpf IS NOT NULL
          AND u.cpf = requisicoes.solicitante_cpf
        )
        OR (
          u.cpf IS NULL
          AND lower(NULLIF(BTRIM(u.nome), '')) = lower(NULLIF(BTRIM(requisicoes.solicitante), ''))
          AND lower(
            COALESCE(
              NULLIF(BTRIM(u.unidade_nome), ''),
              NULLIF(BTRIM(u.setor), '')
            )
          ) = lower(COALESCE(NULLIF(BTRIM(requisicoes.setor), ''), ''))
        )
      )
  )
);
