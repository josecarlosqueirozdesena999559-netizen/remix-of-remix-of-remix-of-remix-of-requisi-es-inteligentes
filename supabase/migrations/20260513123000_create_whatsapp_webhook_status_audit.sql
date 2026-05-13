create table if not exists public.whatsapp_webhook_status_audit (
  message_id text primary key,
  recipient_id text,
  status text not null,
  occurred_at timestamptz,
  conversation_id text,
  conversation_origin text,
  pricing_category text,
  pricing_model text,
  pricing_billable boolean,
  error_summary text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_status_audit_status_idx
  on public.whatsapp_webhook_status_audit (status);

create index if not exists whatsapp_webhook_status_audit_created_at_idx
  on public.whatsapp_webhook_status_audit (created_at desc);

create or replace function public.set_whatsapp_webhook_status_audit_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_whatsapp_webhook_status_audit_updated_at on public.whatsapp_webhook_status_audit;
create trigger set_whatsapp_webhook_status_audit_updated_at
before update on public.whatsapp_webhook_status_audit
for each row
execute function public.set_whatsapp_webhook_status_audit_updated_at();

alter table public.whatsapp_webhook_status_audit enable row level security;

drop policy if exists "Admins can read WhatsApp webhook status audit" on public.whatsapp_webhook_status_audit;
create policy "Admins can read WhatsApp webhook status audit"
on public.whatsapp_webhook_status_audit
for select
to authenticated
using (public.can_manage_private_app_settings());
