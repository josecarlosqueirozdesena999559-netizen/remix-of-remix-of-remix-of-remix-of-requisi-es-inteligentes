-- Combines fruits, vegetables and proteins into one material type for Ramon/Hospital requests.
do $$
declare
  combined_category text := 'Frutas, Verduras e Proteinas';
  allowed_categories jsonb := jsonb_build_array(combined_category);
begin
  update public.usuarios
  set
    categorias_permitidas = allowed_categories,
    funcao = combined_category,
    updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramonhospital', 'ramon')
     or lower(trim(coalesce(email, ''))) = 'ramonhospital@usuarios.solicite.local';

  update public.itens
  set categoria = combined_category, subcategoria = null
  where public.normalize_shared_sector_text(coalesce(categoria, '')) in (
    public.normalize_shared_sector_text('Frutas'),
    public.normalize_shared_sector_text('Verduras'),
    public.normalize_shared_sector_text('Proteinas'),
    public.normalize_shared_sector_text('Proteínas')
  )
  or public.normalize_shared_sector_text(nome) in (
    public.normalize_shared_sector_text('FRUTAS'),
    public.normalize_shared_sector_text('VERDURAS'),
    public.normalize_shared_sector_text('PROTEINAS'),
    public.normalize_shared_sector_text('PROTEÍNAS')
  );

  insert into public.itens (nome, unidade, categoria, subcategoria)
  select item.nome, item.unidade, combined_category, null
  from (
    values
      ('FRUTAS', 'KG'),
      ('VERDURAS', 'KG'),
      ('PROTEINAS', 'KG')
  ) as item(nome, unidade)
  where not exists (
    select 1
    from public.itens existing
    where public.normalize_shared_sector_text(existing.nome) = public.normalize_shared_sector_text(item.nome)
      and public.normalize_shared_sector_text(coalesce(existing.categoria, '')) = public.normalize_shared_sector_text(combined_category)
  );
end;
$$;
