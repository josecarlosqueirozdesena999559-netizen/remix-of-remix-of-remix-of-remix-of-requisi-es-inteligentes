-- Allows shared sector logins to list users linked to their sector through setor_responsaveis.
create or replace function public.can_shared_sector_read_user(
  target_user_id uuid,
  target_setor text,
  target_unidade_nome text,
  target_usuario text,
  target_funcao text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() is not null
    and public.normalize_shared_sector_text(target_funcao) <> 'login compartilhado'
    and public.normalize_shared_sector_text(target_usuario) <> 'hospital'
    and (
      public.normalize_shared_sector_text(target_setor) = public.current_shared_sector_name()
      or public.normalize_shared_sector_text(target_unidade_nome) = public.current_shared_sector_name()
      or exists (
        select 1
        from public.setor_responsaveis sr
        join public.setores s on s.id = sr.setor_id
        where sr.usuario_id = target_user_id
          and public.normalize_shared_sector_text(s.nome) = public.current_shared_sector_name()
      )
    );
$$;

revoke all on function public.can_shared_sector_read_user(uuid, text, text, text, text) from public;
grant execute on function public.can_shared_sector_read_user(uuid, text, text, text, text) to authenticated;

-- Keep the previous signature available for older helpers.
create or replace function public.can_shared_sector_read_user(
  target_setor text,
  target_unidade_nome text,
  target_usuario text,
  target_funcao text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() is not null
    and public.normalize_shared_sector_text(target_funcao) <> 'login compartilhado'
    and public.normalize_shared_sector_text(target_usuario) <> 'hospital'
    and (
      public.normalize_shared_sector_text(target_setor) = public.current_shared_sector_name()
      or public.normalize_shared_sector_text(target_unidade_nome) = public.current_shared_sector_name()
    );
$$;

revoke all on function public.can_shared_sector_read_user(text, text, text, text) from public;
grant execute on function public.can_shared_sector_read_user(text, text, text, text) to authenticated;

drop policy if exists "Shared sector login can read users from own sector" on public.usuarios;

create policy "Shared sector login can read users from own sector"
on public.usuarios
for select
using (
  auth_user_id = auth.uid()
  or public.can_shared_sector_read_user(id, setor, unidade_nome, usuario, funcao)
);

-- Andressa also belongs to Dona Lili, even if another linked sector is her primary unidade_nome.
insert into public.setor_responsaveis (setor_id, usuario_id)
select s.id, u.id
from public.setores s
cross join public.usuarios u
where (
    public.shared_sector_login_slug(s.nome) = 'donalili'
    or public.normalize_shared_sector_text(s.nome) like '%dona lili%'
  )
  and public.normalize_shared_sector_text(u.usuario) = 'andressa'
on conflict (setor_id, usuario_id) do nothing;