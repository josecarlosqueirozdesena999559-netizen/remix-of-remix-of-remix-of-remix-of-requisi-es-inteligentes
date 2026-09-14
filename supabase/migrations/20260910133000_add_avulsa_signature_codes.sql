CREATE SEQUENCE IF NOT EXISTS public.assinatura_avulsa_code_seq;

ALTER TABLE public.assinaturas_avulsas
  ADD COLUMN IF NOT EXISTS avulsa_codigo text;

CREATE OR REPLACE FUNCTION public.set_assinatura_avulsa_codigo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.avulsa_codigo IS NULL OR btrim(NEW.avulsa_codigo) = '' THEN
    NEW.avulsa_codigo := 'AV-' || lpad(nextval('public.assinatura_avulsa_code_seq')::text, 5, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_assinatura_avulsa_codigo_trigger ON public.assinaturas_avulsas;
CREATE TRIGGER set_assinatura_avulsa_codigo_trigger
BEFORE INSERT ON public.assinaturas_avulsas
FOR EACH ROW
EXECUTE FUNCTION public.set_assinatura_avulsa_codigo();

UPDATE public.assinaturas_avulsas
SET avulsa_codigo = 'AV-' || lpad(nextval('public.assinatura_avulsa_code_seq')::text, 5, '0')
WHERE avulsa_codigo IS NULL OR btrim(avulsa_codigo) = '';

CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_avulsas_avulsa_codigo_unique_idx
  ON public.assinaturas_avulsas (avulsa_codigo)
  WHERE avulsa_codigo IS NOT NULL;
