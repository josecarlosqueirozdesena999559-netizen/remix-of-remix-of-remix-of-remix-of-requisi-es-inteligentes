-- Adds Fruits, Vegetables and Proteins as first-class material types for Ramon/Hospital requests.
do $$
declare
  produce_categories jsonb := jsonb_build_array('Frutas', 'Verduras', 'Proteinas');
begin
  update public.usuarios
  set
    categorias_permitidas = produce_categories,
    funcao = 'Frutas, Verduras e Proteinas',
    updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramonhospital', 'ramon')
     or lower(trim(coalesce(email, ''))) = 'ramonhospital@usuarios.solicite.local';

  update public.itens
  set categoria = 'Frutas', subcategoria = null
  where public.normalize_shared_sector_text(nome) = 'frutas';

  update public.itens
  set categoria = 'Verduras', subcategoria = null
  where public.normalize_shared_sector_text(nome) = 'verduras';

  insert into public.itens (nome, unidade, categoria, subcategoria)
  select item.nome, item.unidade, item.categoria, null
  from (
    values
      ('FRUTAS', 'KG', 'Frutas'),
      ('VERDURAS', 'KG', 'Verduras'),
      ('PROTEINAS', 'KG', 'Proteinas')
  ) as item(nome, unidade, categoria)
  where not exists (
    select 1
    from public.itens existing
    where public.normalize_shared_sector_text(existing.nome) = public.normalize_shared_sector_text(item.nome)
      and public.normalize_shared_sector_text(coalesce(existing.categoria, '')) = public.normalize_shared_sector_text(item.categoria)
  );
end;
$$;
