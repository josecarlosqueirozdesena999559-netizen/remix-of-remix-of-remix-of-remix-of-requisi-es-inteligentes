-- Add a virtual pre-login group for system administrators while preserving the existing
-- sector-based lookup for all other users. The public response still excludes email and CPF.
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
  select results.person_name, results.login_usuario, results.requester_id
  from (
    select users.person_name, users.login_usuario, users.requester_id
    from public.search_login_users_by_sector(p_sector_key) users
    where lower(trim(coalesce(p_sector_key, ''))) <> '__system_admins__'

    union all

    select
      coalesce(nullif(trim(admin_account.nome), ''), trim(admin_account.usuario)) as person_name,
      admin_account.usuario::text as login_usuario,
      null::uuid as requester_id
    from public.usuarios admin_account
    where lower(trim(coalesce(p_sector_key, ''))) = '__system_admins__'
      and admin_account.is_admin is true
      and admin_account.auth_user_id is not null
      and nullif(trim(coalesce(admin_account.usuario, '')), '') is not null
      and public.normalize_shared_sector_text(admin_account.usuario) <> 'hospital'
      and public.normalize_shared_sector_text(admin_account.funcao) <> 'login compartilhado'
      and (
        select count(*)
        from public.usuarios matched
        where lower(trim(coalesce(matched.usuario, ''))) = lower(trim(admin_account.usuario))
           or lower(trim(coalesce(matched.email, ''))) = lower(trim(admin_account.usuario))
      ) = 1
  ) results
  order by public.normalize_shared_sector_text(results.person_name), results.person_name
  limit 500;
$function$;

revoke all on function public.search_login_people_by_sector(text) from public;
grant execute on function public.search_login_people_by_sector(text) to anon, authenticated;
