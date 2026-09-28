-- Gives Ramon's authenticated account one consistent, narrow authorization path
-- for creating and managing only his own destination requests.
create or replace function public.current_user_can_manage_ramon_request(
  request_solicitante text,
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
        or lower(trim(coalesce(u.email, ''))) =
          lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
        or lower(trim(coalesce(u.nome, ''))) like '%ramon%'
      )
  )
  and lower(trim(coalesce(request_solicitante, ''))) like '%ramon%'
  and public.normalize_shared_sector_text(coalesce(request_setor, '')) in (
    'atencao basica',
    'hospital',
    'casa de apoio'
  );
$$;

revoke all on function public.current_user_can_manage_ramon_request(text, text) from public;
grant execute on function public.current_user_can_manage_ramon_request(text, text) to authenticated;

drop policy if exists "Ramon can insert own destination requisicoes" on public.requisicoes;
create policy "Ramon can insert own destination requisicoes"
on public.requisicoes
for insert
to authenticated
with check (
  public.current_user_can_manage_ramon_request(solicitante, setor)
);

drop policy if exists "Ramon can update own destination requisicoes" on public.requisicoes;
create policy "Ramon can update own destination requisicoes"
on public.requisicoes
for update
to authenticated
using (
  public.current_user_can_manage_ramon_request(solicitante, setor)
)
with check (
  public.current_user_can_manage_ramon_request(solicitante, setor)
);

grant insert, update on public.requisicoes to authenticated;

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
        or public.current_user_can_manage_ramon_request(r.solicitante, r.setor)
        or (
          public.is_current_user_shared_sector_login()
          and public.can_shared_sector_access_request(r.setor)
        )
      )
  );
$$;
