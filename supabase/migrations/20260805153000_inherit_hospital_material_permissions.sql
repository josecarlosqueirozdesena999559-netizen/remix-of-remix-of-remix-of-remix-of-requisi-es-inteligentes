-- Ensures users from the HOSPITAL sector can request the materials released to the shared hospital login.
do $$
declare
  default_categories jsonb := jsonb_build_array(
    'Generos alimenticio/limpeza',
    'Ambulatorial',
    'Odontologico',
    'Laboratorio',
    'SESB',
    'Expediente'
  );
  source_categories jsonb;
begin
  select u.categorias_permitidas
  into source_categories
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) = 'hospital'
    and jsonb_typeof(u.categorias_permitidas) = 'array'
    and jsonb_array_length(u.categorias_permitidas) > 0
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if source_categories is null then
    select s.categorias_permitidas
    into source_categories
    from public.setores s
    where lower(trim(coalesce(s.nome, ''))) = 'hospital'
      and jsonb_typeof(s.categorias_permitidas) = 'array'
      and jsonb_array_length(s.categorias_permitidas) > 0
    order by s.id desc
    limit 1;
  end if;

  source_categories := coalesce(source_categories, default_categories);

  update public.setores s
  set categorias_permitidas = source_categories
  where lower(trim(coalesce(s.nome, ''))) = 'hospital'
    and (
      s.categorias_permitidas is null
      or jsonb_typeof(s.categorias_permitidas) <> 'array'
      or jsonb_array_length(s.categorias_permitidas) = 0
    );

  update public.usuarios u
  set
    categorias_permitidas = source_categories,
    updated_at = now()
  where lower(trim(coalesce(u.usuario, ''))) <> 'hospital'
    and (
      lower(trim(coalesce(u.setor, ''))) = 'hospital'
      or lower(trim(coalesce(u.unidade_nome, ''))) = 'hospital'
    )
    and (
      u.categorias_permitidas is null
      or jsonb_typeof(u.categorias_permitidas) <> 'array'
      or jsonb_array_length(u.categorias_permitidas) = 0
    );
end;
$$;