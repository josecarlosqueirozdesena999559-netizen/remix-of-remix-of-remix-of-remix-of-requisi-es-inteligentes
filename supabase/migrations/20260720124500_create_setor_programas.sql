create table if not exists public.setor_programas (
  id uuid primary key default gen_random_uuid(),
  setor_id integer not null references public.setores(id) on delete cascade,
  programa_id uuid not null references public.programas(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (setor_id, programa_id)
);

insert into public.setor_programas (setor_id, programa_id)
select s.id, p.id
from public.setores s
join public.programas p on lower(trim(p.nome)) = lower(trim(s.programa))
where s.programa is not null
on conflict do nothing;

alter table public.setor_programas enable row level security;

drop policy if exists "Admins can manage setor programas" on public.setor_programas;
create policy "Admins can manage setor programas"
on public.setor_programas
for all
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.is_admin = true
  )
);

drop policy if exists "Users can read own setor programas" on public.setor_programas;
create policy "Users can read own setor programas"
on public.setor_programas
for select
using (
  exists (
    select 1
    from public.setor_responsaveis sr
    join public.usuarios u on u.id = sr.usuario_id
    where sr.setor_id = setor_programas.setor_id
      and u.auth_user_id = auth.uid()
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.setor_programas;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
