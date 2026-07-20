alter table public.setores
  add column if not exists responsavel_cpf text,
  add column if not exists categorias_permitidas jsonb not null default '[]'::jsonb;

update public.setores
set categorias_permitidas = '[]'::jsonb
where categorias_permitidas is null;
