alter table public.usuarios
  add column if not exists usuario text;

update public.usuarios
set usuario = case
  when lower(email) = 'admin@pereiro.ce.gov.br' then 'Admin'
  when lower(email) = 'shirley@admin.com' then 'Sirley'
  when lower(email) = 'jose@tste.cm' then 'Jose'
  when lower(email) = 'mariaclarasistema@ce.com' then 'Maria Clara'
  when lower(email) = 'emultsistema@ce.com' then 'Dagna'
  when lower(email) = 'elaine.gerl@gmail.com' then 'Elaine'
  when lower(email) = 'gildodiogenes@sistema.com' then 'Gildo'
  when lower(email) = 'franciscodeassi@ce.com' then 'Sava'
  when lower(email) = 'roberta@sistemace.com' then 'Roberta'
  when lower(email) = 'farmaciamunicipalsistema@ce.com' then 'Nadia'
  when lower(email) = 'almoxarifadopereiro@gmail.com' then 'Jose'
  when lower(email) = 'dra.vitoriaff@gmail.com' then 'Vitoria'
  when lower(email) = 'dayana@sistemace.com' then 'Dayana'
  when lower(email) = 'donalilisistema@ce.com' then 'Luana'
  when lower(email) = 'kennedyq@gmail.com' then 'Kennedy'
  when lower(email) = 'donalilisistema03@ce.com' then 'Andressa'
  when lower(email) = 'lorena@sistemace.com' then 'Cintia'
  when lower(email) = 'monsenhorsistema@ce.com' then 'Melissa'
  when lower(email) = 'dyelse@sistemace.com' then 'Dyelsse'
  when lower(email) = 'maeotaviasistema@ce.com' then 'Thainara'
  when lower(email) = 'rebeca@ce.com' then 'Rebeca'
  when lower(email) = 'monsenhorubs@sistema.com' then 'Beatriz'
  when lower(email) = 'crioulassistema@ce.com' then 'Stefani'
  when lower(email) = 'odontologico@ce.com' then 'Enoc'
  when lower(email) = 'francisco@ce.com' then 'Francisco'
  when lower(email) = 'joaoribeirosistema@ce.com' then 'Marilia'
  when lower(email) = 'jenni@sistemace.com' then 'Jenni'
  when upper(nome) = 'FRANCISCO RAMON RODRIGUES DA SILVA' then 'Ramon'
  else split_part(trim(nome), ' ', 1)
end
where usuario is null or trim(usuario) = '';

update public.usuarios
set usuario = 'Jose Carlos'
where lower(email) = 'almoxarifadopereiro@gmail.com'
  and exists (
    select 1
    from public.usuarios u
    where lower(u.email) = 'jose@tste.cm'
  );

with repetidos as (
  select
    id,
    row_number() over (partition by lower(usuario) order by created_at, id) as ordem
  from public.usuarios
)
update public.usuarios u
set usuario = u.usuario || ' ' || repetidos.ordem
from repetidos
where repetidos.id = u.id
  and repetidos.ordem > 1;

alter table public.usuarios
  alter column usuario set not null;

create unique index if not exists usuarios_usuario_lower_key
  on public.usuarios (lower(usuario));
