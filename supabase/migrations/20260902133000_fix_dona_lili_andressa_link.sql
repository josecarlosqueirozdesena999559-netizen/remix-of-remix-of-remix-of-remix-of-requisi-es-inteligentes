-- Keeps Andressa selectable in Dona Lili without moving her primary sector.
insert into public.setor_responsaveis (setor_id, usuario_id)
select s.id, u.id
from public.setores s
cross join public.usuarios u
where (
    public.shared_sector_login_slug(s.nome) = 'donalili'
    or public.normalize_shared_sector_text(s.nome) like '%dona lili%'
  )
  and (
    public.normalize_shared_sector_text(u.usuario) = 'andressa'
    or public.normalize_shared_sector_text(u.nome) like '%andressa%'
  )
on conflict (setor_id, usuario_id) do nothing;