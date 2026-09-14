-- Keeps Ramon compatible with deployed clients that still only know the legacy food/cleaning type.
do $$
declare
  compatible_categories jsonb := jsonb_build_array(
    'Generos alimenticio/limpeza',
    'Frutas',
    'Verduras',
    'Proteinas'
  );
begin
  update public.usuarios
  set
    categorias_permitidas = compatible_categories,
    updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramonhospital', 'ramon')
     or lower(trim(coalesce(email, ''))) = 'ramonhospital@usuarios.solicite.local';
end;
$$;
