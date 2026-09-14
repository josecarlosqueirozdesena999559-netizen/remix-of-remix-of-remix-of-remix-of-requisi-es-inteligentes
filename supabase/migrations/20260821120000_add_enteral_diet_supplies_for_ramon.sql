-- Adds enteral diet supplies as a Ramon-only request category.
do $$
declare
  produce_category text := 'Frutas, Verduras e Proteinas';
  enteral_category text := 'Insumos para Dietas Enterais';
  allowed_categories jsonb := jsonb_build_array(produce_category, enteral_category);
begin
  update public.usuarios
  set
    categorias_permitidas = allowed_categories,
    funcao = 'Frutas, Verduras, Proteinas e Dietas Enterais',
    updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramonhospital', 'ramon')
     or lower(trim(coalesce(email, ''))) = 'ramonhospital@usuarios.solicite.local';
end;
$$;