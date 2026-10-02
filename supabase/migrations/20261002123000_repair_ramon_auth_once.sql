-- Keeps the Ramon account bound to its own sector and profile.
do $$
declare
  v_auth_user_id uuid;
  v_sector_id integer;
begin
  select id into v_auth_user_id
  from auth.users
  where lower(trim(email)) = 'ramon@sistemace.com'
  limit 1;

  if v_auth_user_id is null then
    raise exception 'Conta ramon@sistemace.com nao encontrada no Auth.';
  end if;

  select id into v_sector_id
  from public.setores
  where public.normalize_shared_sector_text(nome) = 'ramon - dietas enterais'
  order by id
  limit 1;

  if v_sector_id is null then
    raise exception 'Setor proprio do Ramon nao encontrado.';
  end if;

  update public.usuarios
  set auth_user_id = v_auth_user_id,
      usuario = 'ramon',
      email = 'ramon@sistemace.com',
      setor = 'RAMON - DIETAS ENTERAIS',
      unidade_nome = 'RAMON - DIETAS ENTERAIS',
      funcao = 'Dietas Enterais, Frutas, Verduras e Limpeza',
      categorias_permitidas = jsonb_build_array(
        'Insumos para Dietas Enterais',
        'Frutas, Verduras e Proteínas',
        'Gêneros alimentícios/limpeza'
      ),
      updated_at = now()
  where lower(trim(email)) = 'ramon@sistemace.com';

  delete from public.setor_responsaveis sr
  using public.usuarios u
  where sr.usuario_id = u.id
    and lower(trim(u.email)) = 'ramon@sistemace.com'
    and sr.setor_id <> v_sector_id;

  insert into public.setor_responsaveis (setor_id, usuario_id)
  select v_sector_id, u.id
  from public.usuarios u
  where lower(trim(u.email)) = 'ramon@sistemace.com'
  on conflict (setor_id, usuario_id) do nothing;
end;
$$;