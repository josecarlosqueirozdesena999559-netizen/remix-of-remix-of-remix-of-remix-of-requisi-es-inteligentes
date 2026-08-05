-- Allows login lookup by either usuario or email.
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
