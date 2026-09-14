-- Standardizes unified UBS/posto folders so each one pulls the real users from that unit.

delete from public.setor_responsaveis sr
using public.setores s, public.usuarios u
where sr.setor_id = s.id
  and sr.usuario_id = u.id
  and public.normalize_shared_sector_text(s.nome) like 'ubs -%'
  and (
    public.normalize_shared_sector_text(u.funcao) = 'login compartilhado'
    or (
      public.normalize_shared_sector_text(coalesce(u.unidade_nome, '')) <> public.normalize_shared_sector_text(s.nome)
      and public.normalize_shared_sector_text(coalesce(u.setor, '')) <> public.normalize_shared_sector_text(s.nome)
    )
  );

insert into public.setor_responsaveis (setor_id, usuario_id)
select s.id, u.id
from public.setores s
join public.usuarios u
  on (
    public.normalize_shared_sector_text(coalesce(u.unidade_nome, '')) = public.normalize_shared_sector_text(s.nome)
    or public.normalize_shared_sector_text(coalesce(u.setor, '')) = public.normalize_shared_sector_text(s.nome)
  )
where public.normalize_shared_sector_text(s.nome) like 'ubs -%'
  and public.normalize_shared_sector_text(u.funcao) <> 'login compartilhado'
on conflict (setor_id, usuario_id) do nothing;

-- Allows a shared posto login to read the responsible links for its own unit as a fallback.
drop policy if exists "Shared sector login can read own setor responsaveis" on public.setor_responsaveis;

create policy "Shared sector login can read own setor responsaveis"
on public.setor_responsaveis
for select
using (
  exists (
    select 1
    from public.setores s
    where s.id = setor_responsaveis.setor_id
      and public.can_shared_sector_access_request(s.nome)
  )
);