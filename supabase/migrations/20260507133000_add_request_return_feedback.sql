ALTER TABLE public.requisicoes
ADD COLUMN IF NOT EXISTS return_reason text,
ADD COLUMN IF NOT EXISTS return_target text,
ADD COLUMN IF NOT EXISTS returned_at timestamptz;
