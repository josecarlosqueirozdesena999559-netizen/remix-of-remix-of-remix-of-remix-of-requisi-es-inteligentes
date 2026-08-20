-- Adds a distinct fresh produce subcategory for food supply requests.
do $$
begin
  insert into public.itens (nome, unidade, categoria, subcategoria)
  select item.nome, item.unidade, item.categoria, item.subcategoria
  from (
    values
      ('FRUTAS', 'KG', 'Generos alimenticio/limpeza', 'Frutas e Verduras'),
      ('VERDURAS', 'KG', 'Generos alimenticio/limpeza', 'Frutas e Verduras')
  ) as item(nome, unidade, categoria, subcategoria)
  where not exists (
    select 1
    from public.itens existing
    where public.normalize_shared_sector_text(existing.nome) = public.normalize_shared_sector_text(item.nome)
      and public.normalize_shared_sector_text(coalesce(existing.categoria, '')) like '%generos%limpeza%'
  );

  update public.itens
  set subcategoria = 'Frutas e Verduras'
  where coalesce(subcategoria, '') is distinct from 'Frutas e Verduras'
    and (
      public.normalize_shared_sector_text(coalesce(categoria, '')) like '%generos%alimenticio%limpeza%'
      or public.normalize_shared_sector_text(coalesce(categoria, '')) like '%generos%alimenticios%limpeza%'
    )
    and (
      public.normalize_shared_sector_text(nome) like '%fruta%'
      or public.normalize_shared_sector_text(nome) like '%verdura%'
      or public.normalize_shared_sector_text(nome) like '%hortifruti%'
      or public.normalize_shared_sector_text(nome) like '%banana%'
      or public.normalize_shared_sector_text(nome) like '%maca%'
      or public.normalize_shared_sector_text(nome) like '%mamao%'
      or public.normalize_shared_sector_text(nome) like '%melancia%'
      or public.normalize_shared_sector_text(nome) like '%abacaxi%'
      or public.normalize_shared_sector_text(nome) like '%laranja%'
      or public.normalize_shared_sector_text(nome) like '%tomate%'
      or public.normalize_shared_sector_text(nome) like '%cebola%'
      or public.normalize_shared_sector_text(nome) like '%batata%'
      or public.normalize_shared_sector_text(nome) like '%cenoura%'
      or public.normalize_shared_sector_text(nome) like '%alface%'
      or public.normalize_shared_sector_text(nome) like '%repolho%'
      or public.normalize_shared_sector_text(nome) like '%cheiro verde%'
    );
end;
$$;