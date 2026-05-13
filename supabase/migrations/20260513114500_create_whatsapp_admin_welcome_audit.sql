create table if not exists public.whatsapp_admin_welcome_audit (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  target_number text not null,
  ok boolean not null,
  message_id text,
  error text,
  triggered_at timestamptz not null,
  request_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_admin_welcome_audit_run_id_idx
  on public.whatsapp_admin_welcome_audit (run_id);

create index if not exists whatsapp_admin_welcome_audit_created_at_idx
  on public.whatsapp_admin_welcome_audit (created_at desc);

alter table public.whatsapp_admin_welcome_audit enable row level security;

drop policy if exists "Admins can read WhatsApp admin welcome audit" on public.whatsapp_admin_welcome_audit;
create policy "Admins can read WhatsApp admin welcome audit"
on public.whatsapp_admin_welcome_audit
for select
to authenticated
using (public.can_manage_private_app_settings());
