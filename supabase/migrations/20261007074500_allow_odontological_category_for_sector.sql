-- Allow the odontological sector to request products in the Odontológico category.
UPDATE public.setores AS s
SET categorias_permitidas = COALESCE(s.categorias_permitidas, '[]'::jsonb) || '["Odontológico"]'::jsonb
WHERE public.normalize_shared_sector_text(s.nome) = 'odontologico'
  AND jsonb_typeof(COALESCE(s.categorias_permitidas, '[]'::jsonb)) = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(s.categorias_permitidas, '[]'::jsonb)
    ) AS category(value)
    WHERE public.normalize_shared_sector_text(category.value) = 'odontologico'
  );
