-- Allows only the shared hospital login to create requests for selected hospital requesters,
-- without depending on the request payload matching CPF/name/setor perfectly.
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
  );
$$;

revoke all on function public.is_current_user_hospital_login() from public;
grant execute on function public.is_current_user_hospital_login() to authenticated;

create policy "Hospital can insert requisicoes"
on public.requisicoes
for insert
to authenticated
with check (public.is_current_user_hospital_login());

grant insert on public.requisicoes to authenticated;