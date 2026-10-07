insert into public.setor_responsaveis (setor_id, usuario_id)
select distinct s.id, u.id
from public.setores s
join public.usuarios u
  on public.normalize_shared_sector_text(
       coalesce(nullif(trim(u.unidade_nome), ''), nullif(trim(u.setor), ''), '')
     ) = public.normalize_shared_sector_text(s.nome)
where coalesce(u.is_admin, false) = false
  and public.normalize_shared_sector_text(coalesce(u.funcao, '')) <> 'login compartilhado'
on conflict (setor_id, usuario_id) do nothing;
