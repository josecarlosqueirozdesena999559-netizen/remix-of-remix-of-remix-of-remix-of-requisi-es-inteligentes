WITH location_names(old_name, new_name) AS (
  VALUES
    ('FARMACIA MUNICIPAL', 'FARMÁCIA MUNICIPAL'),
    ('UBS - JOAO RIBEIRO', 'UBS - JOÃO RIBEIRO'),
    ('UBS - MAE OTAVIA', 'UBS - MÃE OTÁVIA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE')
)
UPDATE public.setores s
SET nome = location_names.new_name
FROM location_names
WHERE upper(trim(s.nome)) = location_names.old_name;

WITH location_names(old_name, new_name) AS (
  VALUES
    ('FARMACIA MUNICIPAL', 'FARMÁCIA MUNICIPAL'),
    ('UBS - JOAO RIBEIRO', 'UBS - JOÃO RIBEIRO'),
    ('UBS - MAE OTAVIA', 'UBS - MÃE OTÁVIA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE')
)
UPDATE public.requisicoes r
SET setor = location_names.new_name,
    updated_at = now()
FROM location_names
WHERE upper(trim(r.setor)) = location_names.old_name;

WITH location_names(old_name, new_name) AS (
  VALUES
    ('FARMACIA MUNICIPAL', 'FARMÁCIA MUNICIPAL'),
    ('UBS - JOAO RIBEIRO', 'UBS - JOÃO RIBEIRO'),
    ('UBS - MAE OTAVIA', 'UBS - MÃE OTÁVIA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE')
)
UPDATE public.usuarios u
SET unidade_nome = location_names.new_name,
    updated_at = now()
FROM location_names
WHERE upper(trim(u.unidade_nome)) = location_names.old_name;
