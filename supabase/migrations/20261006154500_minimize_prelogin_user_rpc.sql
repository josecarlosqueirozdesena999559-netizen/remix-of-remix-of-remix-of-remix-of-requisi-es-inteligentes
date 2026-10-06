-- The anonymous pre-login flow must list people, but it should only receive the fields needed
-- to show/select a person and authenticate. Keep the richer deduplication RPC private.
revoke all on function public.search_login_users_by_sector(text) from public, anon, authenticated;

create or replace function public.search_login_people_by_sector(p_sector_key text)
returns table (
  person_name text,
  login_usuario text,
  requester_id uuid
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    users.person_name,
    users.login_usuario,
    users.requester_id
  from public.search_login_users_by_sector(p_sector_key) users
  order by public.normalize_shared_sector_text(users.person_name), users.person_name
  limit 500;
$function$;

revoke all on function public.search_login_people_by_sector(text) from public;
grant execute on function public.search_login_people_by_sector(text) to anon, authenticated;
