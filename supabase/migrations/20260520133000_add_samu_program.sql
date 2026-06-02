INSERT INTO public.programas (nome)
SELECT 'SAMU'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.programas
  WHERE upper(trim(nome)) = 'SAMU'
);
