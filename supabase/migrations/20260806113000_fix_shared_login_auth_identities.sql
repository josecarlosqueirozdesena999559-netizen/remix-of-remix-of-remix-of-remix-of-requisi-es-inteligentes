-- Fixes email identities for shared sector logins so Supabase Auth can sign them in.
update auth.identities i
set
  provider_id = i.user_id::text,
  identity_data = jsonb_build_object(
    'sub', i.user_id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  updated_at = now()
from auth.users u
join public.usuarios p
  on p.auth_user_id = u.id
where i.user_id = u.id
  and i.provider = 'email'
  and public.normalize_shared_sector_text(p.funcao) = 'login compartilhado';