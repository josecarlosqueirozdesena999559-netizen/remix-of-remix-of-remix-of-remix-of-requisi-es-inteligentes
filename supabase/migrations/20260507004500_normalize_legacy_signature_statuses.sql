UPDATE public.requisicoes
SET status = 'recebido'
WHERE status = 'requisicao_assinada'
  AND signed_attachment IS NOT NULL;

UPDATE public.requisicoes
SET status = 'aguardando_assinatura'
WHERE status = 'aguardando_assinatura_requisicao';
