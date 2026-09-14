create table if not exists public.whatsapp_webhook_message_audit (
  message_id text primary key,
  sender_id text,
  message_type text,
  body text,
  occurred_at timestamptz,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_message_audit_sender_idx
  on public.whatsapp_webhook_message_audit (sender_id);

create index if not exists whatsapp_webhook_message_audit_created_at_idx
  on public.whatsapp_webhook_message_audit (created_at desc);

alter table public.whatsapp_webhook_message_audit enable row level security;

drop policy if exists "Admins can read WhatsApp webhook message audit" on public.whatsapp_webhook_message_audit;
create policy "Admins can read WhatsApp webhook message audit"
on public.whatsapp_webhook_message_audit
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and (u.is_admin = true or u.role = 'admin')
  )
);
