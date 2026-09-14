-- Allows the shared hospital login to list users from its own sector.
drop policy if exists "Hospital can read users from own sector" on public.usuarios;

create policy "Hospital can read users from own sector"
on public.usuarios
for select
using (
  auth_user_id = auth.uid()
  or exists (
    select 1
    from public.usuarios current_user_profile
    where current_user_profile.auth_user_id = auth.uid()
      and lower(trim(coalesce(current_user_profile.usuario, ''))) = 'hospital'
      and lower(trim(coalesce(usuarios.usuario, ''))) <> 'hospital'
      and (
        lower(trim(coalesce(usuarios.unidade_nome, ''))) = lower(trim(coalesce(current_user_profile.unidade_nome, '')))
        or lower(trim(coalesce(usuarios.setor, ''))) = lower(trim(coalesce(current_user_profile.setor, '')))
        or lower(trim(coalesce(usuarios.unidade_nome, ''))) = lower(trim(coalesce(current_user_profile.setor, '')))
        or lower(trim(coalesce(usuarios.setor, ''))) = lower(trim(coalesce(current_user_profile.unidade_nome, '')))
      )
  )
);
