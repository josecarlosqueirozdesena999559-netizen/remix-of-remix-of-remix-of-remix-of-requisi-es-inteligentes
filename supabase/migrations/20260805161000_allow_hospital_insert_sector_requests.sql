-- Allows the shared hospital login to create requests for users from the HOSPITAL sector.
drop policy if exists "Users can insert own requisicoes" on public.requisicoes;
drop function if exists public.can_insert_requisicao_for_current_user(text, text, text);

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
  select exists (
    select 1
    from public.usuarios current_user_profile
    where current_user_profile.auth_user_id = auth.uid()
      and (
        current_user_profile.is_admin = true
        or (
          lower(trim(coalesce(current_user_profile.usuario, ''))) = 'hospital'
          and lower(trim(coalesce(request_setor, ''))) = 'hospital'
          and exists (
            select 1
            from public.usuarios requester_profile
            where lower(trim(coalesce(requester_profile.nome, ''))) = lower(trim(coalesce(request_solicitante, '')))
              and (
                nullif(trim(coalesce(request_solicitante_cpf, '')), '') is null
                or nullif(trim(coalesce(requester_profile.cpf, '')), '') = nullif(trim(coalesce(request_solicitante_cpf, '')), '')
              )
              and (
                lower(trim(coalesce(requester_profile.setor, ''))) = 'hospital'
                or lower(trim(coalesce(requester_profile.unidade_nome, ''))) = 'hospital'
              )
          )
        )
        or (
          nullif(trim(coalesce(current_user_profile.cpf, '')), '') is not null
          and nullif(trim(coalesce(current_user_profile.cpf, '')), '') = nullif(trim(coalesce(request_solicitante_cpf, '')), '')
        )
        or (
          nullif(trim(coalesce(current_user_profile.cpf, '')), '') is null
          and lower(trim(coalesce(current_user_profile.nome, ''))) = lower(trim(coalesce(request_solicitante, '')))
          and lower(trim(coalesce(current_user_profile.unidade_nome, current_user_profile.setor, ''))) = lower(trim(coalesce(request_setor, '')))
        )
      )
  );
$$;

revoke all on function public.can_insert_requisicao_for_current_user(text, text, text) from public;
grant execute on function public.can_insert_requisicao_for_current_user(text, text, text) to authenticated;

create policy "Users can insert own requisicoes"
on public.requisicoes
for insert
to authenticated
with check (
  public.can_insert_requisicao_for_current_user(setor, solicitante, solicitante_cpf)
);