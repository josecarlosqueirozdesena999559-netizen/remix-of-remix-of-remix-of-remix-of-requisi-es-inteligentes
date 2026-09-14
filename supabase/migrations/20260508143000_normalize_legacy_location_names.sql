CREATE OR REPLACE FUNCTION public.normalize_location_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      lower(
        translate(
          COALESCE(value, ''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
        )
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

WITH canonical_setores AS (
  SELECT
    s.nome,
    s.programa,
    public.normalize_location_key(s.nome) AS normalized_nome
  FROM public.setores s
),
usuarios_matches AS (
  SELECT
    u.id,
    matched.nome AS canonical_nome,
    matched.programa AS canonical_programa
  FROM public.usuarios u
  JOIN LATERAL (
    SELECT cs.nome, cs.programa
    FROM canonical_setores cs
    WHERE public.normalize_location_key(u.unidade_nome) <> ''
      AND (
        cs.normalized_nome = public.normalize_location_key(u.unidade_nome)
        OR (
          length(cs.normalized_nome) >= 5
          AND length(public.normalize_location_key(u.unidade_nome)) >= 5
          AND (
            cs.normalized_nome LIKE '%' || public.normalize_location_key(u.unidade_nome) || '%'
            OR public.normalize_location_key(u.unidade_nome) LIKE '%' || cs.normalized_nome || '%'
          )
        )
      )
    ORDER BY
      CASE WHEN cs.normalized_nome = public.normalize_location_key(u.unidade_nome) THEN 0 ELSE 1 END,
      length(cs.normalized_nome) DESC
    LIMIT 2
  ) matched ON TRUE
  GROUP BY u.id, matched.nome, matched.programa
  HAVING COUNT(*) = 1
),
requisicoes_matches AS (
  SELECT
    r.id,
    matched.nome AS canonical_nome
  FROM public.requisicoes r
  JOIN LATERAL (
    SELECT cs.nome
    FROM canonical_setores cs
    WHERE public.normalize_location_key(r.setor) <> ''
      AND (
        cs.normalized_nome = public.normalize_location_key(r.setor)
        OR (
          length(cs.normalized_nome) >= 5
          AND length(public.normalize_location_key(r.setor)) >= 5
          AND (
            cs.normalized_nome LIKE '%' || public.normalize_location_key(r.setor) || '%'
            OR public.normalize_location_key(r.setor) LIKE '%' || cs.normalized_nome || '%'
          )
        )
      )
    ORDER BY
      CASE WHEN cs.normalized_nome = public.normalize_location_key(r.setor) THEN 0 ELSE 1 END,
      length(cs.normalized_nome) DESC
    LIMIT 2
  ) matched ON TRUE
  GROUP BY r.id, matched.nome
  HAVING COUNT(*) = 1
)
UPDATE public.usuarios u
SET
  unidade_nome = um.canonical_nome,
  setor = COALESCE(um.canonical_programa, u.setor),
  updated_at = now()
FROM usuarios_matches um
WHERE u.id = um.id
  AND (
    COALESCE(u.unidade_nome, '') IS DISTINCT FROM COALESCE(um.canonical_nome, '')
    OR COALESCE(u.setor, '') IS DISTINCT FROM COALESCE(um.canonical_programa, COALESCE(u.setor, ''))
  );

UPDATE public.requisicoes r
SET setor = rm.canonical_nome,
    updated_at = now()
FROM requisicoes_matches rm
WHERE r.id = rm.id
  AND COALESCE(r.setor, '') IS DISTINCT FROM COALESCE(rm.canonical_nome, '');
