-- Restores the authenticated identity and Hospital link for Ramon.
-- This keeps requisicao RLS scoped to Ramon's own authenticated account.
do $$
declare
  ramon_auth_id uuid;
  ramon_cpf text;
  ramon_profile_id uuid;
begin
  select au.id
  into ramon_auth_id
  from auth.users au
  where lower(trim(coalesce(au.email, ''))) in (
    'ramon@sistemace.com',
    'ramonhospital@usuarios.solicite.local'
  )
  order by case
    when lower(trim(coalesce(au.email, ''))) = 'ramon@sistemace.com' then 0
    else 1
  end
  limit 1;

  select nullif(trim(u.cpf), '')
  into ramon_cpf
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
     or lower(trim(coalesce(u.email, ''))) in (
       'ramon@sistemace.com',
       'ramonhospital@usuarios.solicite.local'
     )
  order by case when nullif(trim(u.cpf), '') is not null then 0 else 1 end,
           u.updated_at desc nulls last,
           u.created_at desc nulls last
  limit 1;

  select u.id
  into ramon_profile_id
  from public.usuarios u
  where lower(trim(coalesce(u.usuario, ''))) = 'ramonhospital'
     or lower(trim(coalesce(u.email, ''))) = 'ramonhospital@usuarios.solicite.local'
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if ramon_profile_id is not null then
    update public.usuarios
    set
      auth_user_id = coalesce(ramon_auth_id, auth_user_id),
      cpf = coalesce(ramon_cpf, cpf),
      setor = coalesce(nullif(trim(setor), ''), 'HOSPITAL'),
      unidade_nome = coalesce(nullif(trim(unidade_nome), ''), 'HOSPITAL'),
      updated_at = now()
    where id = ramon_profile_id;

    insert into public.setor_responsaveis (setor_id, usuario_id)
    select s.id, ramon_profile_id
    from public.setores s
    where public.normalize_shared_sector_text(s.nome) = 'hospital'
    on conflict (setor_id, usuario_id) do nothing;
  end if;

  update public.usuarios u
  set auth_user_id = ramon_auth_id,
      updated_at = now()
  where ramon_auth_id is not null
    and lower(trim(coalesce(u.email, ''))) = 'ramon@sistemace.com'
    and lower(trim(coalesce(u.nome, ''))) like '%ramon%';
end;
$$;
