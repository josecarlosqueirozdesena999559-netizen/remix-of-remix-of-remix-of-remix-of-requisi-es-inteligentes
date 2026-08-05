-- Makes Adriana request through the shared hospital login with hospital material permissions.
do $$
declare
  hospital_categories jsonb;
  default_categories jsonb := jsonb_build_array(
    'Generos alimenticio/limpeza',
    'Ambulatorial',
    'Odontologico',
    'Laboratorio',
    'SESB',
    'Expediente'
  );
begin
  select u.categorias_permitidas
  into hospital_categories
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) = 'hospital'
    and jsonb_typeof(u.categorias_permitidas) = 'array'
    and jsonb_array_length(u.categorias_permitidas) > 0
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if hospital_categories is null then
    select s.categorias_permitidas
    into hospital_categories
    from public.setores s
    where lower(trim(coalesce(s.nome, ''))) = 'hospital'
      and jsonb_typeof(s.categorias_permitidas) = 'array'
      and jsonb_array_length(s.categorias_permitidas) > 0
    order by s.id desc
    limit 1;
  end if;

  hospital_categories := coalesce(hospital_categories, default_categories);

  update public.usuarios u
  set
    auth_user_id = null,
    usuario = null,
    setor = 'HOSPITAL',
    unidade_nome = 'HOSPITAL',
    categorias_permitidas = hospital_categories,
    updated_at = now()
  where lower(trim(coalesce(u.nome, ''))) = 'adriana carlos cavalcante'
     or lower(trim(coalesce(u.email, ''))) = 'adrianacavalcante@usuarios.solicite.local';

  update public.setores s
  set categorias_permitidas = hospital_categories
  where lower(trim(coalesce(s.nome, ''))) = 'hospital'
    and (
      s.categorias_permitidas is null
      or jsonb_typeof(s.categorias_permitidas) <> 'array'
      or jsonb_array_length(s.categorias_permitidas) = 0
    );
end;
$$;