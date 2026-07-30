CREATE TABLE IF NOT EXISTS public.document_upload_quota (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  admin_output_upload_consumed boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  consumed_by uuid
);

INSERT INTO public.document_upload_quota (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.document_upload_quota ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.document_upload_quota FROM anon, authenticated;

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
  -- Keep server-side maintenance and migrations working.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.bucket_id <> 'requisicoes'
    OR NEW.name NOT LIKE 'saidas/%'
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

DROP TRIGGER IF EXISTS enforce_document_upload_quota_trigger ON storage.objects;
CREATE TRIGGER enforce_document_upload_quota_trigger
BEFORE INSERT ON storage.objects
FOR EACH ROW
WHEN (NEW.bucket_id = 'requisicoes')
EXECUTE FUNCTION public.enforce_document_upload_quota();

DROP POLICY IF EXISTS "Authenticated users can upload requisicoes files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update requisicoes files" ON storage.objects;
DROP POLICY IF EXISTS "Administrator can upload the final requisicoes output" ON storage.objects;

CREATE POLICY "Administrator can upload the final requisicoes output"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'requisicoes'
  AND name LIKE 'saidas/%'
  AND EXISTS (
    SELECT 1
    FROM public.usuarios
    WHERE auth_user_id = auth.uid()
      AND is_admin = true
  )
);

COMMENT ON TABLE public.document_upload_quota IS
  'Global quota that permits one final administrator output upload after this migration.';
