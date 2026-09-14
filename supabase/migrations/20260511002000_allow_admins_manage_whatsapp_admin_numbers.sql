create or replace function public.can_manage_private_app_settings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  );
$$;

grant execute on function public.can_manage_private_app_settings() to authenticated;

drop policy if exists "Admins can read WhatsApp admin numbers" on public.app_settings;
create policy "Admins can read WhatsApp admin numbers"
on public.app_settings
for select
to authenticated
using (
  key = 'WHATSAPP_ADMIN_NUMBERS'
  and public.can_manage_private_app_settings()
);

drop policy if exists "Admins can insert WhatsApp admin numbers" on public.app_settings;
create policy "Admins can insert WhatsApp admin numbers"
on public.app_settings
for insert
to authenticated
with check (
  key = 'WHATSAPP_ADMIN_NUMBERS'
  and public.can_manage_private_app_settings()
);

drop policy if exists "Admins can update WhatsApp admin numbers" on public.app_settings;
create policy "Admins can update WhatsApp admin numbers"
on public.app_settings
for update
to authenticated
using (
  key = 'WHATSAPP_ADMIN_NUMBERS'
  and public.can_manage_private_app_settings()
)
with check (
  key = 'WHATSAPP_ADMIN_NUMBERS'
  and public.can_manage_private_app_settings()
);
