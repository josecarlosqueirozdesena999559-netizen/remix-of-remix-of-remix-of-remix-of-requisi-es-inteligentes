-- Keeps the Ramon profile bound to its authentication account.
-- The password reset was performed through Supabase Auth and is intentionally
-- not stored in the source-controlled migration.
do $$
declare
  v_auth_user_id uuid;
begin
  select coalesce(
    (
      select u.auth_user_id
      from public.usuarios u
      where lower(trim(coalesce(u.usuario, ''))) = 'ramon'
        and u.auth_user_id is not null
      order by u.updated_at desc nulls last, u.created_at desc nulls last
      limit 1
    ),
    (
      select au.id
      from auth.users au
      where lower(trim(au.email)) = 'ramon@sistemace.com'
      limit 1
    )
  )
  into v_auth_user_id;

  if v_auth_user_id is null then
    raise exception 'Conta de autenticacao do Ramon nao foi encontrada.';
  end if;


  update public.usuarios
  set auth_user_id = v_auth_user_id,
      email = 'ramon@sistemace.com',
      usuario = 'ramon',
      updated_at = now()
  where auth_user_id = v_auth_user_id
     or lower(trim(coalesce(usuario, ''))) = 'ramon'
     or lower(trim(coalesce(email, ''))) = 'ramon@sistemace.com';
end;
$$;

-- Ensure the compact username always resolves to Ramon's authentication email.
create or replace function public.resolve_login_email(p_usuario text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  login_value text := lower(trim(coalesce(p_usuario, '')));
  matched_count integer;
  matched_email text;
begin
  if login_value = 'ramon' then
    return 'ramon@sistemace.com';
  end if;

  select count(*), min(email)
  into matched_count, matched_email
  from public.usuarios
  where lower(trim(coalesce(usuario, ''))) = login_value
     or lower(trim(coalesce(email, ''))) = login_value;

  if matched_count = 1 then
    return matched_email;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;