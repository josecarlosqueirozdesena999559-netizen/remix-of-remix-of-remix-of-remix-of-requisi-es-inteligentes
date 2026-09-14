INSERT INTO public.programas (nome)
SELECT n FROM (VALUES
  ('HOSPITAL'),
  ('ATENCAO BASICA'),
  ('SECRETARIA DE SAUDE'),
  ('VIGILANCIA SANITARIA'),
  ('ENDEMIAS'),
  ('CASA DE APOIO'),
  ('SESB'),
  ('ODONTOLOGICO'),
  ('FISIOTERAPIA'),
  ('SAMU')
) AS v(n)
WHERE NOT EXISTS (
  SELECT 1 FROM public.programas p WHERE p.nome = v.n
);
