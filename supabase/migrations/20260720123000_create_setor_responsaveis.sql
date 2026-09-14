create table if not exists public.setor_responsaveis (
  id uuid primary key default gen_random_uuid(),
  setor_id integer not null references public.setores(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (setor_id, usuario_id)
);

alter table public.setor_responsaveis enable row level security;

drop policy if exists "Admins can manage setor responsaveis" on public.setor_responsaveis;
create policy "Admins can manage setor responsaveis"
on public.setor_responsaveis
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

drop policy if exists "Users can read own setor responsaveis" on public.setor_responsaveis;
create policy "Users can read own setor responsaveis"
on public.setor_responsaveis
for select
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = setor_responsaveis.usuario_id
      and u.auth_user_id = auth.uid()
  )
);

alter publication supabase_realtime add table public.setor_responsaveis;
