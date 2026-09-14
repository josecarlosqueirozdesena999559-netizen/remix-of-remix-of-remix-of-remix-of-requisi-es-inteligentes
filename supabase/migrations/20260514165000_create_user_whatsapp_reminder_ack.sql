create table if not exists public.user_whatsapp_reminder_ack (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  reminder_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, reminder_date)
);

create index if not exists user_whatsapp_reminder_ack_user_date_idx
  on public.user_whatsapp_reminder_ack (user_id, reminder_date);

alter table public.user_whatsapp_reminder_ack enable row level security;

drop policy if exists "Users can read own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack;
create policy "Users can read own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack;
create policy "Users can insert own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);

drop policy if exists "Users can update own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack;
create policy "Users can update own WhatsApp reminder acknowledgements"
on public.user_whatsapp_reminder_ack
for update
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
);
