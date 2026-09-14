CREATE OR REPLACE FUNCTION public.get_pending_signature_control(
  p_localidade text DEFAULT NULL,
  p_nome text DEFAULT NULL
)
RETURNS TABLE (
  localidade text,
  nome text,
  quantidade_assinaturas_pendentes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Apenas administradores podem acessar este controle.';
  END IF;

  RETURN QUERY
  WITH usuarios_base AS (
    SELECT
      u.cpf,
      u.nome,
      COALESCE(
        NULLIF(BTRIM(u.unidade_nome), ''),
        NULLIF(BTRIM(u.setor), ''),
        'Sem localidade'
      ) AS localidade
    FROM public.usuarios u
    WHERE COALESCE(u.is_admin, false) = false
      AND NULLIF(BTRIM(u.nome), '') IS NOT NULL
  ),
  pendencias AS (
    SELECT
      r.solicitante_cpf AS cpf,
      COUNT(*)::bigint AS quantidade_assinaturas_pendentes
    FROM public.requisicoes r
    WHERE r.status IN (
      'aguardando_assinatura',
      'aguardando_assinatura_requisicao',
      'aguardando_assinatura_saida',
      'correcao_requisicao'
    )
    GROUP BY r.solicitante_cpf
  )
  SELECT
    ub.localidade,
    ub.nome,
    COALESCE(p.quantidade_assinaturas_pendentes, 0)::bigint AS quantidade_assinaturas_pendentes
  FROM usuarios_base ub
  LEFT JOIN pendencias p
    ON p.cpf = ub.cpf
  WHERE (
      NULLIF(BTRIM(p_localidade), '') IS NULL
      OR ub.localidade ILIKE '%' || BTRIM(p_localidade) || '%'
    )
    AND (
      NULLIF(BTRIM(p_nome), '') IS NULL
      OR ub.nome ILIKE '%' || BTRIM(p_nome) || '%'
    )
  ORDER BY ub.localidade, ub.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_signature_control(text, text) TO authenticated;
