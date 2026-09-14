-- Limits Ramon/Hospital requester to fruits, vegetables and proteins only.
do $$
declare
  allowed_categories jsonb := jsonb_build_array('Frutas', 'Verduras', 'Proteinas');
begin
  update public.usuarios
  set
    categorias_permitidas = allowed_categories,
    funcao = 'Frutas, Verduras e Proteinas',
    updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramonhospital', 'ramon')
     or lower(trim(coalesce(email, ''))) = 'ramonhospital@usuarios.solicite.local';
end;
$$;
