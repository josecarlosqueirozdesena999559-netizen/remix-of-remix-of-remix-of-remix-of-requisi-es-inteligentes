-- Keep the first login step focused on sector names only. The second RPC still lists the
-- users after a sector is selected, as required by the pre-login flow.
create or replace function public.search_login_sectors(p_query text)
returns table (
  sector_key text,
  sector_name text
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
      and nullif(trim(coalesce(shared.usuario, '')), '') is not null
      and (
        select count(*)
        from public.usuarios matched
        where lower(trim(coalesce(matched.usuario, ''))) = lower(trim(shared.usuario))
           or lower(trim(coalesce(matched.email, ''))) = lower(trim(shared.usuario))
      ) = 1
  ),
  sector_rows as (
    select
      public.normalize_shared_sector_text(cleaned.sector_name) as sector_key,
      cleaned.sector_name
    from public.usuarios account
    cross join lateral (
      select coalesce(
        nullif(
          trim(
            regexp_replace(
              coalesce(
                nullif(trim(account.unidade_nome), ''),
                nullif(trim(account.setor), ''),
                'Sem setor'
              ),
              '^(ubs|posto|unidade básica de saúde|unidade basica de saude)[[:space:]]*-?[[:space:]]*',
              '',
              'i'
            )
          ),
          ''
        ),
        'Sem setor'
      ) as sector_name
    ) cleaned
    where account.auth_user_id is not null
      and nullif(trim(coalesce(account.usuario, '')), '') is not null
      and public.normalize_shared_sector_text(account.usuario) <> 'hospital'
      and public.normalize_shared_sector_text(account.funcao) <> 'login compartilhado'
      and (
        select count(*)
        from public.usuarios matched
        where lower(trim(coalesce(matched.usuario, ''))) = lower(trim(account.usuario))
           or lower(trim(coalesce(matched.email, ''))) = lower(trim(account.usuario))
      ) = 1

    union all

    select distinct
      public.normalize_shared_sector_text(cleaned.sector_name) as sector_key,
      cleaned.sector_name
    from shared_profiles shared
    cross join lateral (
      select coalesce(
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
      ) as sector_name
    ) cleaned
    join public.usuarios requester
      on public.normalize_shared_sector_text(requester.usuario) <> 'hospital'
     and public.normalize_shared_sector_text(requester.funcao) <> 'login compartilhado'
     and (
       public.normalize_shared_sector_text(requester.unidade_nome)
         = public.normalize_shared_sector_text(shared.location_name)
       or public.normalize_shared_sector_text(requester.setor)
         = public.normalize_shared_sector_text(shared.location_name)
       or public.normalize_shared_sector_text(requester.unidade_nome)
         = public.normalize_shared_sector_text(cleaned.sector_name)
       or public.normalize_shared_sector_text(requester.setor)
         = public.normalize_shared_sector_text(cleaned.sector_name)
       or exists (
         select 1
         from public.setores sector
         join public.setor_responsaveis link on link.setor_id = sector.id
         where (
             public.normalize_shared_sector_text(sector.nome)
               = public.normalize_shared_sector_text(shared.location_name)
             or public.normalize_shared_sector_text(sector.nome)
               = public.normalize_shared_sector_text(cleaned.sector_name)
           )
           and link.usuario_id = requester.id
       )
     )
  )
  select
    rows.sector_key,
    min(rows.sector_name) as sector_name
  from sector_rows rows
  cross join search_term query
  where char_length(query.value) between 2 and 80
    and rows.sector_key <> ''
    and strpos(rows.sector_key, query.value) > 0
  group by rows.sector_key
  order by min(rows.sector_name)
  limit 50;
$function$;

revoke all on function public.search_login_sectors(text) from public;
grant execute on function public.search_login_sectors(text) to anon, authenticated;
