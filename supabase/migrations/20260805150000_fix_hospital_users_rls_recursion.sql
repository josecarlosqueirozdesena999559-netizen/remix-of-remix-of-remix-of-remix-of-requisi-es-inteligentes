-- Fixes recursive RLS on usuarios for the shared hospital login.
drop policy if exists "Hospital can read users from own sector" on public.usuarios;

drop function if exists public.can_hospital_read_sector_user(text, text, text);

create or replace function public.can_hospital_read_sector_user(
  target_setor text,
  target_unidade_nome text,
  target_usuario text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios current_user_profile
    where current_user_profile.auth_user_id = auth.uid()
      and lower(trim(coalesce(current_user_profile.usuario, ''))) = 'hospital'
      and lower(trim(coalesce(target_usuario, ''))) <> 'hospital'
      and (
        lower(trim(coalesce(target_unidade_nome, ''))) = lower(trim(coalesce(current_user_profile.unidade_nome, '')))
        or lower(trim(coalesce(target_setor, ''))) = lower(trim(coalesce(current_user_profile.setor, '')))
        or lower(trim(coalesce(target_unidade_nome, ''))) = lower(trim(coalesce(current_user_profile.setor, '')))
        or lower(trim(coalesce(target_setor, ''))) = lower(trim(coalesce(current_user_profile.unidade_nome, '')))
      )
  );
$$;

revoke all on function public.can_hospital_read_sector_user(text, text, text) from public;
grant execute on function public.can_hospital_read_sector_user(text, text, text) to authenticated;

create policy "Hospital can read users from own sector"
on public.usuarios
for select
using (
  auth_user_id = auth.uid()
  or public.can_hospital_read_sector_user(setor, unidade_nome, usuario)
);
