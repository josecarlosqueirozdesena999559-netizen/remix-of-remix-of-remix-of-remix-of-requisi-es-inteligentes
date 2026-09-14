drop policy if exists "Admins can read WhatsApp admin sessions" on public.app_settings;
create policy "Admins can read WhatsApp admin sessions"
on public.app_settings
for select
to authenticated
using (
  key like 'WHATSAPP_ADMIN_SESSION_%'
  and public.can_manage_private_app_settings()
);
