ALTER TABLE public.assinaturas_avulsas
  ADD COLUMN IF NOT EXISTS saida_codigo text;

CREATE INDEX IF NOT EXISTS assinaturas_avulsas_saida_codigo_idx
  ON public.assinaturas_avulsas (saida_codigo)
  WHERE saida_codigo IS NOT NULL;
