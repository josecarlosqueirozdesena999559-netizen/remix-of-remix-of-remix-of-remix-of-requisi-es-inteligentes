INSERT INTO storage.buckets (id, name, public)
VALUES ('requisicoes', 'requisicoes', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read requisicoes files'
  ) THEN
    CREATE POLICY "Authenticated users can read requisicoes files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'requisicoes');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload requisicoes files'
  ) THEN
    CREATE POLICY "Authenticated users can upload requisicoes files"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'requisicoes');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can update requisicoes files'
  ) THEN
    CREATE POLICY "Authenticated users can update requisicoes files"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'requisicoes')
    WITH CHECK (bucket_id = 'requisicoes');
  END IF;
END $$;
