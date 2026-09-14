WITH program_names(old_name, new_name) AS (
  VALUES
    ('ATENCAO BASICA', 'ATENÇÃO BÁSICA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE'),
    ('VIGILANCIA SANITARIA', 'VIGILÂNCIA SANITÁRIA'),
    ('ODONTOLOGICO', 'ODONTOLÓGICO')
)
UPDATE public.setores s
SET nome = program_names.new_name
FROM program_names
WHERE upper(trim(s.nome)) = program_names.old_name;

WITH program_names(old_name, new_name) AS (
  VALUES
    ('ATENCAO BASICA', 'ATENÇÃO BÁSICA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE'),
    ('VIGILANCIA SANITARIA', 'VIGILÂNCIA SANITÁRIA'),
    ('ODONTOLOGICO', 'ODONTOLÓGICO')
)
UPDATE public.usuarios u
SET unidade_nome = program_names.new_name
FROM program_names
WHERE upper(trim(u.unidade_nome)) = program_names.old_name;
