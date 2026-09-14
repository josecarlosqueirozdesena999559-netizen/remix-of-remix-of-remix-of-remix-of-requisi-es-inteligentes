UPDATE public.requisicoes
SET status = 'recebido'
WHERE status = 'concluido'
  AND admin_attachment IS NULL
  AND signed_attachment IS NOT NULL
  AND jsonb_typeof(signed_attachment) = 'object'
  AND COALESCE(signed_attachment -> 'output', 'null'::jsonb) = 'null'::jsonb;
