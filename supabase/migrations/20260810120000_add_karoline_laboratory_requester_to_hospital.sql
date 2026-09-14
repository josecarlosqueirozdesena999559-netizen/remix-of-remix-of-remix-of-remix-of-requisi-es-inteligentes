-- Adds Karoline as a Hospital requester with access to Laboratory items.
do $$
declare
  target_user_id uuid;
  target_usuario text := 'karolinehospital';
  target_email text := 'karolinehospital@usuarios.solicite.local';
  laboratory_categories jsonb := jsonb_build_array('Laboratorio');
begin
  select u.id
    into target_user_id
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) = target_usuario
     or lower(trim(coalesce(u.email, ''))) = target_email
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
      'KAROLINE',
      target_usuario,
      null,
      'usuario',
      false,
      'Laboratorio',
      'HOSPITAL',
      'HOSPITAL',
      laboratory_categories
    )
    returning id into target_user_id;
  else
    update public.usuarios
    set
      email = target_email,
      nome = coalesce(nullif(trim(nome), ''), 'KAROLINE'),
      usuario = target_usuario,
      role = coalesce(role, 'usuario'),
      is_admin = false,
      funcao = coalesce(nullif(trim(funcao), ''), 'Laboratorio'),
      setor = 'HOSPITAL',
      unidade_nome = 'HOSPITAL',
      categorias_permitidas = laboratory_categories,
      updated_at = now()
    where id = target_user_id;
  end if;

  insert into public.setor_responsaveis (setor_id, usuario_id)
  select s.id, target_user_id
  from public.setores s
  where public.normalize_shared_sector_text(s.nome) = 'hospital'
  on conflict (setor_id, usuario_id) do nothing;
end;
$$;