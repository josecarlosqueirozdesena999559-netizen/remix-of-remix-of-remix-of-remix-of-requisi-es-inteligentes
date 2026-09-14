-- Adds Dyelsse as a Hospital requester using the shared Hospital login.
do $$
declare
  target_user_id uuid;
  target_usuario text := 'dyelssehospital';
  target_email text := 'dyelssehospital@usuarios.solicite.local';
  target_cpf text := '06852185389';
  hospital_categories jsonb := jsonb_build_array('Ambulatorial', 'Expediente');
begin
  select u.id
    into target_user_id
  from public.usuarios u
  where (
      lower(trim(coalesce(u.usuario, ''))) = target_usuario
      or lower(trim(coalesce(u.email, ''))) = target_email
      or (
        upper(trim(coalesce(u.nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
        and lower(trim(coalesce(u.usuario, ''))) <> 'hospital'
      )
    )
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if target_user_id is null then
    insert into public.usuarios (
      auth_user_id,
      email,
      nome,
      usuario,
      cpf,
      role,
      is_admin,
      funcao,
      setor,
      unidade_nome,
      categorias_permitidas
    ) values (
      null,
      target_email,
      'DYELSSE LARISSA DOS SANTOS',
      target_usuario,
      target_cpf,
      'usuario',
      false,
      'HOSPITAL',
      'HOSPITAL',
      'HOSPITAL',
      hospital_categories
    )
    returning id into target_user_id;
  else
    update public.usuarios
    set
      auth_user_id = null,
      email = target_email,
      nome = 'DYELSSE LARISSA DOS SANTOS',
      usuario = target_usuario,
      cpf = coalesce(nullif(trim(cpf), ''), target_cpf),
      role = coalesce(role, 'usuario'),
      is_admin = false,
      funcao = 'HOSPITAL',
      setor = 'HOSPITAL',
      unidade_nome = 'HOSPITAL',
      categorias_permitidas = hospital_categories,
      updated_at = now()
    where id = target_user_id
      and lower(trim(coalesce(usuario, ''))) <> 'hospital';
  end if;

  insert into public.setor_responsaveis (setor_id, usuario_id)
  select s.id, target_user_id
  from public.setores s
  where public.normalize_shared_sector_text(s.nome) = 'hospital'
  on conflict (setor_id, usuario_id) do nothing;
end;
$$;
