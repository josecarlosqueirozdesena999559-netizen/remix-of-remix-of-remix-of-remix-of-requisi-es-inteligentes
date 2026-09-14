WITH rebuilt_items AS (
  SELECT
    r.id,
    jsonb_agg(
      jsonb_build_object(
        'item', ri.item_nome,
        'nome', ri.item_nome,
        'description', COALESCE(NULLIF(ri.item_descricao, ''), ri.item_nome),
        'descricao', COALESCE(NULLIF(ri.item_descricao, ''), ri.item_nome),
        'unit', COALESCE(NULLIF(ri.unidade, ''), '-'),
        'unidade', COALESCE(NULLIF(ri.unidade, ''), '-'),
        'stock', COALESCE(NULLIF(ri.estoque, ''), '-'),
        'qtdDisponivel', COALESCE(NULLIF(ri.estoque, ''), '-'),
        'need', COALESCE(NULLIF(ri.quantidade_solicitada, ''), '0'),
        'qtdNecessaria', COALESCE(NULLIF(ri.quantidade_solicitada, ''), '0'),
        'quantidade_solicitada', COALESCE(NULLIF(ri.quantidade_solicitada, ''), '0'),
        'categoria', ri.categoria
      )
      ORDER BY ri.ordem, ri.created_at, ri.id
    ) AS items
  FROM public.requisicoes r
  JOIN public.requisicao_itens ri
    ON ri.requisicao_id = r.id
  WHERE (
      r.solicitante = 'DYELSSE LARISSA DOS SANTOS'
      AND (
        (r.data = '06/05/2026' AND r.saida_codigo IN ('060526008', '060526006', '060526005'))
        OR (r.data = '05/05/2026' AND r.saida_codigo IN ('050526011', '050526007'))
      )
    )
    OR (
      upper(r.solicitante) = 'BEATRIZ DIAS MENDES'
      AND r.solicitante_cpf = '06279437302'
      AND r.data = '04/05/2026'
      AND r.saida_codigo = '040526011'
    )
    OR (
      r.solicitante = 'STEFANI DE OLIVEIRA DE AQUINO'
      AND r.setor = 'UBS - CRIOULAS'
      AND (
        (r.data = '06/05/2026' AND r.saida_codigo IN ('060526002', '060526001'))
        OR (r.data = '05/05/2026' AND r.saida_codigo IN ('050526016', '050526015', '050526014', '050526013'))
      )
    )
    OR (
      upper(r.solicitante) = 'MELISSA DIAS HOLANDA'
      AND (
        (r.data = '06/05/2026' AND r.saida_codigo IN ('060526010', '060526004', '060526003'))
        OR (r.data = '05/05/2026' AND r.saida_codigo IN ('050526006'))
        OR (r.data = '24/04/2026' AND r.saida_codigo IN ('240426001'))
        OR (r.data = '22/04/2026' AND r.saida_codigo IN ('220426008'))
      )
    )
  GROUP BY r.id
)
UPDATE public.requisicoes r
SET items = rebuilt_items.items
FROM rebuilt_items
WHERE r.id = rebuilt_items.id;
