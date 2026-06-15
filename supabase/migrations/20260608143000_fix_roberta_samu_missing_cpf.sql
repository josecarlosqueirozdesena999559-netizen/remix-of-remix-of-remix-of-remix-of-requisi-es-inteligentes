WITH roberta_cpf AS (
  SELECT cpf
  FROM public.usuarios
  WHERE lower(email) = 'roberta@sistemace.com'
    AND nullif(btrim(cpf), '') IS NOT NULL
  LIMIT 1
)
UPDATE public.requisicoes r
SET solicitante_cpf = roberta_cpf.cpf
FROM roberta_cpf
WHERE r.solicitante = 'ROBERTA SILVEIRA MACIEL'
  AND r.setor = 'SAMU'
  AND r.status IN ('aguardando_assinatura', 'aguardando_assinatura_requisicao', 'aguardando_assinatura_saida', 'correcao_requisicao')
  AND nullif(btrim(r.solicitante_cpf), '') IS NULL;
