UPDATE public.requisicoes
SET status = 'concluido'
WHERE status = 'recebido'
  AND admin_attachment IS NULL
  AND signed_attachment IS NOT NULL
  AND jsonb_typeof(signed_attachment) = 'object'
  AND NOT (signed_attachment ? 'request')
  AND NOT (signed_attachment ? 'output')
  AND (
    signed_attachment ? 'storagePath'
    OR signed_attachment ? 'storageBucket'
    OR signed_attachment ? 'url'
    OR signed_attachment ? 'publicUrl'
    OR signed_attachment ? 'signedUrl'
  );
