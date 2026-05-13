WITH program_names(old_name, new_name) AS (
  VALUES
    ('ATENCAO BASICA', 'ATENÇÃO BÁSICA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE'),
    ('VIGILANCIA SANITARIA', 'VIGILÂNCIA SANITÁRIA'),
    ('ODONTOLOGICO', 'ODONTOLÓGICO')
)
UPDATE public.programas p
SET nome = program_names.new_name
FROM program_names
WHERE upper(trim(p.nome)) = program_names.old_name;

WITH program_names(old_name, new_name) AS (
  VALUES
    ('ATENCAO BASICA', 'ATENÇÃO BÁSICA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE'),
    ('VIGILANCIA SANITARIA', 'VIGILÂNCIA SANITÁRIA'),
    ('ODONTOLOGICO', 'ODONTOLÓGICO')
)
UPDATE public.setores s
SET programa = program_names.new_name
FROM program_names
WHERE upper(trim(s.programa)) = program_names.old_name;

WITH program_names(old_name, new_name) AS (
  VALUES
    ('ATENCAO BASICA', 'ATENÇÃO BÁSICA'),
    ('SECRETARIA DE SAUDE', 'SECRETARIA DE SAÚDE'),
    ('VIGILANCIA SANITARIA', 'VIGILÂNCIA SANITÁRIA'),
    ('ODONTOLOGICO', 'ODONTOLÓGICO')
)
UPDATE public.usuarios u
SET setor = program_names.new_name
FROM program_names
WHERE upper(trim(u.setor)) = program_names.old_name;
