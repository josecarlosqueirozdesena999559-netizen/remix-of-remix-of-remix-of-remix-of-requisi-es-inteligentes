-- Lets users keep signing requests from every sector they are linked to.
create or replace function public.current_user_can_access_requisicao(
  request_solicitante text,
  request_solicitante_cpf text,
  request_setor text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios u
    where (
        u.auth_user_id = auth.uid()
        or lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        u.is_admin = true
        or (
          nullif(trim(coalesce(u.cpf, '')), '') is not null
          and nullif(trim(coalesce(u.cpf, '')), '') = nullif(trim(coalesce(request_solicitante_cpf, '')), '')
        )
        or (
          lower(trim(coalesce(u.nome, ''))) = lower(trim(coalesce(request_solicitante, '')))
          and (
            public.normalize_shared_sector_text(coalesce(nullif(trim(u.unidade_nome), ''), nullif(trim(u.setor), ''))) =
              public.normalize_shared_sector_text(coalesce(request_setor, ''))
            or exists (
              select 1
              from public.setor_responsaveis sr
              join public.setores s on s.id = sr.setor_id
              where sr.usuario_id = u.id
                and public.normalize_shared_sector_text(s.nome) = public.normalize_shared_sector_text(coalesce(request_setor, ''))
            )
          )
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_requisicao(text, text, text) from public;
grant execute on function public.current_user_can_access_requisicao(text, text, text) to authenticated;

drop policy if exists "Users can read own requisicoes" on public.requisicoes;
create policy "Users can read own requisicoes"
on public.requisicoes
for select
to authenticated
using (
  public.current_user_can_access_requisicao(solicitante, solicitante_cpf, setor)
);

drop policy if exists "Users can sign own requisicoes" on public.requisicoes;
create policy "Users can sign own requisicoes"
on public.requisicoes
for update
to authenticated
using (
  public.current_user_can_access_requisicao(solicitante, solicitante_cpf, setor)
)
with check (
  public.current_user_can_access_requisicao(solicitante, solicitante_cpf, setor)
);

create or replace function public.can_insert_requisicao_for_current_user(
  request_setor text,
  request_solicitante text,
  request_solicitante_cpf text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_can_access_requisicao(
    request_solicitante,
    request_solicitante_cpf,
    request_setor
  )
  or (
    public.is_current_user_shared_sector_login()
    and public.can_shared_sector_access_request(request_setor)
  );
$$;

revoke all on function public.can_insert_requisicao_for_current_user(text, text, text) from public;
grant execute on function public.can_insert_requisicao_for_current_user(text, text, text) to authenticated;

create or replace function public.user_owns_requisicao_storage_path(object_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requisicoes r
    where split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and r.id = split_part(object_name, '/', 2)::uuid
      and (
        public.current_user_can_access_requisicao(r.solicitante, r.solicitante_cpf, r.setor)
        or (
          public.is_current_user_shared_sector_login()
          and public.can_shared_sector_access_request(r.setor)
        )
      )
  );
$$;