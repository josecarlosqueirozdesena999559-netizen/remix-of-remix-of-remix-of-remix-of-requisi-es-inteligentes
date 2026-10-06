-- Return only the fields needed by the pre-login autocomplete.
-- Emails, CPFs, roles, and access permissions are never returned.
create or replace function public.search_login_options(p_query text)
returns table (
  login_usuario text,
  display_name text,
  requester_id uuid,
  is_shared boolean
)
language sql
stable
security definer
set search_path = public
as $function$
  with search_term as (
    select public.normalize_shared_sector_text(coalesce(p_query, '')) as value
  ),
  shared_profiles as (
    select
      shared.id,
      shared.usuario,
      coalesce(
        nullif(trim(shared.unidade_nome), ''),
        nullif(trim(shared.setor), ''),
        nullif(trim(shared.nome), ''),
        shared.usuario
      ) as location_name
    from public.usuarios shared
    where (
        public.normalize_shared_sector_text(shared.usuario) = 'hospital'
        or public.normalize_shared_sector_text(shared.funcao) = 'login compartilhado'
      )
      and shared.auth_user_id is not null
  ),
  options as (
    select
      account.usuario::text as login_usuario,
      upper(trim(account.usuario)) || ' — ' || upper(
        coalesce(nullif(trim(account.nome), ''), trim(account.usuario))
      ) as display_name,
      null::uuid as requester_id,
      false as is_shared
    from public.usuarios account
    cross join search_term query
    where char_length(query.value) between 2 and 80
      and account.auth_user_id is not null
      and nullif(trim(coalesce(account.usuario, '')), '') is not null
      and public.normalize_shared_sector_text(account.usuario) <> 'hospital'
      and public.normalize_shared_sector_text(account.funcao) <> 'login compartilhado'
      and (
        strpos(public.normalize_shared_sector_text(account.usuario), query.value) > 0
        or strpos(public.normalize_shared_sector_text(account.nome), query.value) > 0
        or strpos(public.normalize_shared_sector_text(account.email), query.value) > 0
      )
      and (
        select count(*)
        from public.usuarios matched
        where lower(trim(coalesce(matched.usuario, ''))) = lower(trim(account.usuario))
           or lower(trim(coalesce(matched.email, ''))) = lower(trim(account.usuario))
      ) = 1

    union all

    select distinct
      shared.usuario::text as login_usuario,
      upper(
        coalesce(
          nullif(
            trim(
              regexp_replace(
                shared.location_name,
                '^(ubs|posto|unidade básica de saúde|unidade basica de saude)[[:space:]]*-?[[:space:]]*',
                '',
                'i'
              )
            ),
            ''
          ),
          trim(shared.usuario)
        )
      ) || ' — ' || upper(trim(requester.nome)) as display_name,
      requester.id as requester_id,
      true as is_shared
    from shared_profiles shared
    join public.usuarios requester
      on public.normalize_shared_sector_text(requester.usuario) <> 'hospital'
     and public.normalize_shared_sector_text(requester.funcao) <> 'login compartilhado'
     and (
       public.normalize_shared_sector_text(requester.unidade_nome)
         = public.normalize_shared_sector_text(shared.location_name)
       or public.normalize_shared_sector_text(requester.setor)
         = public.normalize_shared_sector_text(shared.location_name)
       or exists (
         select 1
         from public.setores sector
         join public.setor_responsaveis link on link.setor_id = sector.id
         where public.normalize_shared_sector_text(sector.nome)
             = public.normalize_shared_sector_text(shared.location_name)
           and link.usuario_id = requester.id
       )
     )
    cross join search_term query
    where char_length(query.value) between 2 and 80
      and (
        strpos(public.normalize_shared_sector_text(shared.usuario), query.value) > 0
        or strpos(public.normalize_shared_sector_text(shared.location_name), query.value) > 0
        or strpos(public.normalize_shared_sector_text(requester.nome), query.value) > 0
        or strpos(public.normalize_shared_sector_text(requester.usuario), query.value) > 0
      )
      and (
        select count(*)
        from public.usuarios matched
        where lower(trim(coalesce(matched.usuario, ''))) = lower(trim(shared.usuario))
           or lower(trim(coalesce(matched.email, ''))) = lower(trim(shared.usuario))
      ) = 1
  )
  select
    options.login_usuario,
    options.display_name,
    options.requester_id,
    options.is_shared
  from options
  order by options.display_name
  limit 20;
$function$;

revoke all on function public.search_login_options(text) from public;
grant execute on function public.search_login_options(text) to anon, authenticated;
