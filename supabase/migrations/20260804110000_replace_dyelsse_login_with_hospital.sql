update public.usuarios
set
  usuario = 'hospital',
  unidade_nome = 'HOSPITAL',
  setor = 'HOSPITAL',
  updated_at = now()
where lower(email) = 'dyelse@sistemace.com'
   or lower(trim(coalesce(usuario, ''))) in ('dyelsse', 'dyelse');