-- Security hardening: limit private request documents to authorized users.
DROP POLICY IF EXISTS "Authenticated users can read requisicoes files" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can read requisicoes files" ON storage.objects;

CREATE POLICY "Authorized users can read requisicoes files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'requisicoes'
  AND public.user_owns_requisicao_storage_path(name)
);

-- Defense in depth for uploaded documents and WhatsApp images.
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
WHERE id = 'requisicoes';

-- Security-definer helpers must never be executable by anonymous users.
REVOKE ALL ON FUNCTION public.user_owns_requisicao_storage_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_owns_requisicao_storage_path(text) TO authenticated, service_role;