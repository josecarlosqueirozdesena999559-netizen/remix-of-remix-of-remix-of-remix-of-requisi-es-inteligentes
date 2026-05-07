DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'requisicoes'
      AND policyname = 'Users can read own requisicoes'
  ) THEN
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
          )
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'requisicoes'
      AND policyname = 'Users can sign own requisicoes'
  ) THEN
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
          )
      )
    );
  END IF;
END $$;
