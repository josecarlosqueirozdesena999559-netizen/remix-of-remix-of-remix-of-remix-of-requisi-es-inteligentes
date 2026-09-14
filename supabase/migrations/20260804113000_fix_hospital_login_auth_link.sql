-- Corrige o login compartilhado do hospital mesmo quando o email real no Auth diverge.
with hospital_profile as (
  select id
  from public.usuarios
  where lower(trim(coalesce(usuario, ''))) = 'hospital'
     or lower(trim(coalesce(usuario, ''))) in ('dyelsse', 'dyelse')
     or lower(email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
     or upper(trim(coalesce(nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
  order by
    case when lower(trim(coalesce(usuario, ''))) = 'hospital' then 0 else 1 end,
    updated_at desc nulls last,
    created_at desc nulls last
  limit 1
)
update public.usuarios u
set
  usuario = 'hospital',
  unidade_nome = 'HOSPITAL',
  setor = 'HOSPITAL',
  updated_at = now()
from hospital_profile hp
where u.id = hp.id;

update auth.users au
set
  email_confirmed_at = coalesce(au.email_confirmed_at, now()),
  updated_at = now()
from public.usuarios u
where u.auth_user_id = au.id
  and lower(trim(coalesce(u.usuario, ''))) = 'hospital';

update auth.users au
set
  email_confirmed_at = coalesce(au.email_confirmed_at, now()),
  updated_at = now()
where lower(au.email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
  and not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = au.id
      and lower(trim(coalesce(u.usuario, ''))) = 'hospital'
  );

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
  if requested_usuario = 'hospital' or requested_compact_usuario = 'hospital' then
    select email
    into exact_email
    from public.usuarios
    where lower(trim(coalesce(usuario, ''))) = 'hospital'
       or lower(email) in ('dyelse@sistemace.com', 'dyelsse@sistemace.com')
       or upper(trim(coalesce(nome, ''))) = 'DYELSSE LARISSA DOS SANTOS'
    order by
      case when lower(trim(coalesce(usuario, ''))) = 'hospital' then 0 else 1 end,
      updated_at desc nulls last,
      created_at desc nulls last
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