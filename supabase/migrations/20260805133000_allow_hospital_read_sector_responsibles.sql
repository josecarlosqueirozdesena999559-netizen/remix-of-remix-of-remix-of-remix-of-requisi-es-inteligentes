-- Allows the shared hospital profile to read users linked to its own sector.
drop policy if exists "Hospital can read own sector responsaveis" on public.setor_responsaveis;
create policy "Hospital can read own sector responsaveis"
on public.setor_responsaveis
for select
using (
  exists (
    select 1
    from public.usuarios current_user_profile
    join public.setores s on s.id = setor_responsaveis.setor_id
    where current_user_profile.auth_user_id = auth.uid()
      and lower(trim(coalesce(current_user_profile.usuario, ''))) = 'hospital'
      and (
        lower(trim(coalesce(s.nome, ''))) = lower(trim(coalesce(current_user_profile.unidade_nome, '')))
        or lower(trim(coalesce(s.nome, ''))) = lower(trim(coalesce(current_user_profile.setor, '')))
      )
  )
);