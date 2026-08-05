-- Lets the shared hospital login create requests for hospital requesters.
drop policy if exists "Hospital can insert requisicoes" on public.requisicoes;
drop function if exists public.is_current_user_hospital_login();

create or replace function public.is_current_user_hospital_login()
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
      and lower(trim(coalesce(u.usuario, ''))) = 'hospital'
      and lower(trim(coalesce(u.setor, u.unidade_nome, ''))) = 'hospital'
  );
$$;

revoke all on function public.is_current_user_hospital_login() from public;
grant execute on function public.is_current_user_hospital_login() to authenticated;

create policy "Hospital can insert requisicoes"
on public.requisicoes
for insert
to authenticated
with check (
  public.is_current_user_hospital_login()
  and lower(trim(coalesce(setor, ''))) = 'hospital'
);

grant insert on public.requisicoes to authenticated;

drop policy if exists "Hospital can read requisicoes" on public.requisicoes;

create policy "Hospital can read requisicoes"
on public.requisicoes
for select
to authenticated
using (
  public.is_current_user_hospital_login()
  and lower(trim(coalesce(setor, ''))) = 'hospital'
);

drop policy if exists "Hospital can update requisicoes" on public.requisicoes;

create policy "Hospital can update requisicoes"
on public.requisicoes
for update
to authenticated
using (
  public.is_current_user_hospital_login()
  and lower(trim(coalesce(setor, ''))) = 'hospital'
)
with check (
  public.is_current_user_hospital_login()
  and lower(trim(coalesce(setor, ''))) = 'hospital'
);

grant select, update on public.requisicoes to authenticated;