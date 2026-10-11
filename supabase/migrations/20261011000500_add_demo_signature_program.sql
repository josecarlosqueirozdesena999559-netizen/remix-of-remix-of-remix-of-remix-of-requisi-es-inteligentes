-- Provide one explicitly demo-only program so the test account can create a request.
-- This does not alter program links for any regular sector.
DO $$
DECLARE
  v_sector_id integer;
  v_program_id uuid;
BEGIN
  SELECT s.id
  INTO v_sector_id
  FROM public.setores AS s
  WHERE lower(trim(coalesce(s.nome, ''))) = lower('SETOR TESTE - DEMONSTRAÇÃO')
  ORDER BY s.id
  LIMIT 1;

  IF v_sector_id IS NULL THEN
    RAISE EXCEPTION 'Demo test sector not found; refusing to create a program without its sector.';
  END IF;

  SELECT p.id
  INTO v_program_id
  FROM public.programas AS p
  WHERE lower(trim(p.nome)) = lower('PROGRAMA TESTE - DEMONSTRAÇÃO')
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_program_id IS NULL THEN
    INSERT INTO public.programas (nome, descricao)
    VALUES (
      'PROGRAMA TESTE - DEMONSTRAÇÃO',
      'Programa fictício vinculado somente ao setor de demonstração de assinatura eletrônica.'
    )
    RETURNING id INTO v_program_id;
  END IF;

  INSERT INTO public.setor_programas (setor_id, programa_id)
  VALUES (v_sector_id, v_program_id)
  ON CONFLICT (setor_id, programa_id) DO NOTHING;

  UPDATE public.setores
  SET programa = 'PROGRAMA TESTE - DEMONSTRAÇÃO'
  WHERE id = v_sector_id
    AND programa IS DISTINCT FROM 'PROGRAMA TESTE - DEMONSTRAÇÃO';
END;
$$;
