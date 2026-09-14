create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Generalizes shared request logins from Hospital to every main sector/posto.
create or replace function public.normalize_shared_sector_text(input text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(extensions.unaccent(coalesce(input, '')), '\s+', ' ', 'g')));
$$;

create or replace function public.shared_sector_login_slug(sector_name text)
returns text
language sql
immutable
as $$
  with normalized as (
    select public.normalize_shared_sector_text(sector_name) as value
  ), cleaned as (
    select trim(
      regexp_replace(
        regexp_replace(value, '^(ubs|posto|unidade basica de saude)\s*-?\s*', '', 'i'),
        '\b(dra?|dr|sr|sra)\b\.?',
        '',
        'gi'
      )
    ) as value
    from normalized
  ), compacted as (
    select regexp_replace(value, '[^a-z0-9]+', '', 'g') as value
    from cleaned
  )
  select case
    when public.normalize_shared_sector_text(sector_name) like '%monsenhor%' then 'monsenhor'
    when public.normalize_shared_sector_text(sector_name) = 'hospital' then 'hospital'
    when public.normalize_shared_sector_text(sector_name) like '%secretaria%saude%' then 'secretaria'
    when public.normalize_shared_sector_text(sector_name) = 'samu' then 'samu'
    else nullif(value, '')
  end
  from compacted;
$$;

create or replace function public.current_shared_sector_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select public.normalize_shared_sector_text(
    coalesce(nullif(trim(u.setor), ''), nullif(trim(u.unidade_nome), ''))
  )
  from public.usuarios u
  where (
      u.auth_user_id = auth.uid()
      or lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
    and (
      public.normalize_shared_sector_text(u.usuario) = 'hospital'
      or public.normalize_shared_sector_text(u.funcao) = 'login compartilhado'
    )
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;
$$;

create or replace function public.is_current_user_shared_sector_login()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() is not null;
$$;

create or replace function public.can_shared_sector_access_request(target_setor text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() is not null
    and public.normalize_shared_sector_text(target_setor) = public.current_shared_sector_name();
$$;

create or replace function public.can_shared_sector_read_user(
  target_setor text,
  target_unidade_nome text,
  target_usuario text,
  target_funcao text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() is not null
    and public.normalize_shared_sector_text(target_funcao) <> 'login compartilhado'
    and public.normalize_shared_sector_text(target_usuario) <> 'hospital'
    and (
      public.normalize_shared_sector_text(target_setor) = public.current_shared_sector_name()
      or public.normalize_shared_sector_text(target_unidade_nome) = public.current_shared_sector_name()
    );
$$;

revoke all on function public.normalize_shared_sector_text(text) from public;
revoke all on function public.shared_sector_login_slug(text) from public;
revoke all on function public.current_shared_sector_name() from public;
revoke all on function public.is_current_user_shared_sector_login() from public;
revoke all on function public.can_shared_sector_access_request(text) from public;
revoke all on function public.can_shared_sector_read_user(text, text, text, text) from public;

grant execute on function public.normalize_shared_sector_text(text) to anon, authenticated;
grant execute on function public.shared_sector_login_slug(text) to anon, authenticated;
grant execute on function public.current_shared_sector_name() to authenticated;
grant execute on function public.is_current_user_shared_sector_login() to authenticated;
grant execute on function public.can_shared_sector_access_request(text) to authenticated;
grant execute on function public.can_shared_sector_read_user(text, text, text, text) to authenticated;

-- Keep the old hospital helper as a compatibility alias for any older policies.
create or replace function public.is_current_user_hospital_login()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_shared_sector_name() = 'hospital';
$$;

create or replace function public.can_hospital_read_sector_user(
  target_setor text,
  target_unidade_nome text,
  target_usuario text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_shared_sector_read_user(target_setor, target_unidade_nome, target_usuario, null);
$$;

revoke all on function public.is_current_user_hospital_login() from public;
revoke all on function public.can_hospital_read_sector_user(text, text, text) from public;
grant execute on function public.is_current_user_hospital_login() to authenticated;
grant execute on function public.can_hospital_read_sector_user(text, text, text) to authenticated;

do $$
declare
  sector_row record;
  login_slug text;
  login_email text;
  auth_id uuid;
  profile_id uuid;
begin
  for sector_row in
    select id, nome
    from public.setores
    where nullif(trim(nome), '') is not null
  loop
    login_slug := public.shared_sector_login_slug(sector_row.nome);
    if login_slug is null then
      continue;
    end if;

    login_email := login_slug || '@usuarios.solicite.local';

    select au.id
    into auth_id
    from auth.users au
    where lower(au.email) = lower(login_email)
    limit 1;

    if auth_id is null then
      auth_id := gen_random_uuid();

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change_token_new,
        recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000',
        auth_id,
        'authenticated',
        'authenticated',
        login_email,
        extensions.crypt('123456', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('usuario', login_slug, 'nome', sector_row.nome),
        now(),
        now(),
        '',
        '',
        ''
      );
    else
      update auth.users
      set
        encrypted_password = extensions.crypt('123456', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('usuario', login_slug, 'nome', sector_row.nome),
        updated_at = now()
      where id = auth_id;
    end if;

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      auth_id,
      jsonb_build_object('sub', auth_id::text, 'email', login_email, 'email_verified', true),
      'email',
      login_email,
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
    set
      user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();

    select u.id
    into profile_id
    from public.usuarios u
    where lower(trim(coalesce(u.usuario, ''))) = login_slug
       or lower(trim(coalesce(u.email, ''))) = lower(login_email)
    order by
      case when public.normalize_shared_sector_text(u.funcao) = 'login compartilhado' then 0 else 1 end,
      u.updated_at desc nulls last,
      u.created_at desc nulls last
    limit 1;

    if profile_id is null then
      insert into public.usuarios (
        auth_user_id,
        email,
        nome,
        usuario,
        role,
        is_admin,
        cpf,
        funcao,
        setor,
        unidade_nome,
        categorias_permitidas
      ) values (
        auth_id,
        login_email,
        upper(sector_row.nome),
        login_slug,
        'usuario',
        false,
        null,
        'Login compartilhado',
        sector_row.nome,
        sector_row.nome,
        '[]'::jsonb
      );
    else
      update public.usuarios
      set
        auth_user_id = auth_id,
        email = login_email,
        nome = upper(sector_row.nome),
        usuario = login_slug,
        role = coalesce(role, 'usuario'),
        is_admin = false,
        cpf = null,
        funcao = 'Login compartilhado',
        setor = sector_row.nome,
        unidade_nome = sector_row.nome,
        categorias_permitidas = coalesce(categorias_permitidas, '[]'::jsonb),
        updated_at = now()
      where id = profile_id;
    end if;
  end loop;
end;
$$;

drop policy if exists "Hospital can read users from own sector" on public.usuarios;
drop policy if exists "Shared sector login can read users from own sector" on public.usuarios;

create policy "Shared sector login can read users from own sector"
on public.usuarios
for select
using (
  auth_user_id = auth.uid()
  or public.can_shared_sector_read_user(setor, unidade_nome, usuario, funcao)
);

drop policy if exists "Hospital can insert requisicoes" on public.requisicoes;
drop policy if exists "Hospital can read requisicoes" on public.requisicoes;
drop policy if exists "Hospital can update requisicoes" on public.requisicoes;
drop policy if exists "Shared sector login can insert requisicoes" on public.requisicoes;
drop policy if exists "Shared sector login can read requisicoes" on public.requisicoes;
drop policy if exists "Shared sector login can update requisicoes" on public.requisicoes;

create policy "Shared sector login can insert requisicoes"
on public.requisicoes
for insert
to authenticated
with check (
  public.is_current_user_shared_sector_login()
  and public.can_shared_sector_access_request(setor)
);

create policy "Shared sector login can read requisicoes"
on public.requisicoes
for select
to authenticated
using (
  public.is_current_user_shared_sector_login()
  and public.can_shared_sector_access_request(setor)
);

create policy "Shared sector login can update requisicoes"
on public.requisicoes
for update
to authenticated
using (
  public.is_current_user_shared_sector_login()
  and public.can_shared_sector_access_request(setor)
)
with check (
  public.is_current_user_shared_sector_login()
  and public.can_shared_sector_access_request(setor)
);

grant insert, select, update on public.requisicoes to authenticated;

create or replace function public.user_owns_requisicao_storage_path(object_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requisicoes r
    join public.usuarios u
      on (
        u.auth_user_id = auth.uid()
        or lower(coalesce(u.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    where split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and r.id = split_part(object_name, '/', 2)::uuid
      and (
        u.is_admin = true
        or (
          public.normalize_shared_sector_text(u.funcao) = 'login compartilhado'
          and public.normalize_shared_sector_text(r.setor) = public.normalize_shared_sector_text(
            coalesce(nullif(trim(u.setor), ''), nullif(trim(u.unidade_nome), ''))
          )
        )
        or (
          public.normalize_shared_sector_text(u.usuario) = 'hospital'
          and public.normalize_shared_sector_text(r.setor) = 'hospital'
        )
        or (
          u.cpf is not null
          and u.cpf = r.solicitante_cpf
        )
        or (
          u.cpf is null
          and lower(nullif(btrim(u.nome), '')) = lower(nullif(btrim(r.solicitante), ''))
          and public.normalize_shared_sector_text(coalesce(nullif(btrim(u.unidade_nome), ''), nullif(btrim(u.setor), ''))) =
            public.normalize_shared_sector_text(coalesce(nullif(btrim(r.setor), ''), ''))
        )
      )
  );
$$;