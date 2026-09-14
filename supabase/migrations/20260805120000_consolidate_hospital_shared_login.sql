-- Consolidates the shared Hospital login and stops resolving the old Dyelsse login.
do $$
declare
  hospital_auth_id uuid;
  hospital_profile_id uuid;
  hospital_email text := 'hospital@usuarios.solicite.local';
begin
  select au.id
  into hospital_auth_id
  from auth.users au
  where lower(au.email) = hospital_email
  limit 1;

  if hospital_auth_id is null then
    select u.auth_user_id
    into hospital_auth_id
    from public.usuarios u
    where (
      lower(trim(coalesce(u.usuario, ''))) = 'hospital'
      or lower(trim(coalesce(u.usuario, ''))) in ('dyelsse', 'dyelse')
      or lower(u.email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
      or upper(trim(coalesce(u.nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
    )
    and u.auth_user_id is not null
    limit 1;
  end if;

  if hospital_auth_id is null then
    hospital_auth_id := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      hospital_auth_id,
      'authenticated',
      'authenticated',
      hospital_email,
      crypt('123456', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"usuario":"hospital","nome":"HOSPITAL"}'::jsonb,
      now(),
      now(),
      '',
      '',
      ''
    );
  else
    update auth.users
    set
      email = hospital_email,
      encrypted_password = crypt('123456', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
    where id = hospital_auth_id;
  end if;

  select u.id
  into hospital_profile_id
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) = 'hospital'
     or lower(trim(coalesce(u.usuario, ''))) in ('dyelsse', 'dyelse')
     or lower(u.email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
     or upper(trim(coalesce(u.nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
  order by
    case when lower(trim(coalesce(u.usuario, ''))) = 'hospital' then 0 else 1 end,
    u.updated_at desc nulls last,
    u.created_at desc nulls last
  limit 1;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    hospital_auth_id,
    jsonb_build_object('sub', hospital_auth_id::text, 'email', hospital_email, 'email_verified', true),
    'email',
    hospital_email,
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do update
  set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();
  if hospital_profile_id is null then
    insert into public.usuarios (
      auth_user_id,
      email,
      nome,
      usuario,
      role,
      is_admin,
      setor,
      unidade_nome,
      categorias_permitidas
    ) values (
      hospital_auth_id,
      hospital_email,
      'HOSPITAL',
      'hospital',
      'usuario',
      false,
      'HOSPITAL',
      'HOSPITAL',
      '[]'::jsonb
    )
    returning id into hospital_profile_id;
  else
    update public.usuarios
    set
      auth_user_id = hospital_auth_id,
      email = hospital_email,
      nome = coalesce(nullif(trim(nome), ''), 'HOSPITAL'),
      usuario = 'hospital',
      role = coalesce(role, 'usuario'),
      is_admin = false,
      setor = 'HOSPITAL',
      unidade_nome = 'HOSPITAL',
      updated_at = now()
    where id = hospital_profile_id;
  end if;

  update public.usuarios
  set
    auth_user_id = null,
    usuario = 'login_desativado_' || left(id::text, 8),
    updated_at = now()
  where id <> hospital_profile_id
    and (
      lower(trim(coalesce(usuario, ''))) in ('hospital', 'dyelsse', 'dyelse')
      or lower(email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
      or upper(trim(coalesce(nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
    );

  update auth.users
  set
    email = 'login-desativado-' || id::text || '@usuarios.solicite.local',
    encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
    updated_at = now()
  where id <> hospital_auth_id
    and lower(email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com');
end;
$$;

create or replace function public.resolve_login_email(p_usuario text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  exact_count integer;
  exact_email text;
  compact_count integer;
  compact_email text;
  requested_usuario text := lower(trim(coalesce(p_usuario, '')));
  requested_compact_usuario text := lower(
    regexp_replace(trim(coalesce(p_usuario, '')), '[[:space:]]+', '', 'g')
  );
begin
  if requested_usuario in ('dyelsse', 'dyelse') or requested_compact_usuario in ('dyelsse', 'dyelse') then
    return null;
  end if;

  if requested_usuario = 'hospital' or requested_compact_usuario = 'hospital' then
    select email
    into exact_email
    from public.usuarios
    where lower(trim(coalesce(usuario, ''))) = 'hospital'
    order by updated_at desc nulls last, created_at desc nulls last
    limit 1;

    return exact_email;
  end if;

  select count(*), min(email)
  into exact_count, exact_email
  from public.usuarios
  where lower(trim(coalesce(usuario, ''))) = requested_usuario;

  if exact_count = 1 then
    return exact_email;
  end if;

  select count(*), min(email)
  into compact_count, compact_email
  from public.usuarios
  where lower(regexp_replace(trim(coalesce(usuario, '')), '[[:space:]]+', '', 'g')) =
    requested_compact_usuario;

  if compact_count = 1 then
    return compact_email;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;