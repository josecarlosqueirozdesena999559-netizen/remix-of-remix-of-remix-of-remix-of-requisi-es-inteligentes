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
