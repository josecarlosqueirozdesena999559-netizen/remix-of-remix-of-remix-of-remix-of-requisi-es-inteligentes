-- Normalizes auth.users rows created manually for shared sector logins.
update auth.users u
set
  email_change = coalesce(u.email_change, ''),
  confirmation_token = coalesce(u.confirmation_token, ''),
  recovery_token = coalesce(u.recovery_token, ''),
  email_change_token_new = coalesce(u.email_change_token_new, ''),
  email_change_token_current = coalesce(u.email_change_token_current, ''),
  phone_change = coalesce(u.phone_change, ''),
  phone_change_token = coalesce(u.phone_change_token, ''),
  reauthentication_token = coalesce(u.reauthentication_token, ''),
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || '{"email_verified":true}'::jsonb,
  updated_at = now()
from public.usuarios p
where p.auth_user_id = u.id
  and public.normalize_shared_sector_text(p.funcao) = 'login compartilhado';