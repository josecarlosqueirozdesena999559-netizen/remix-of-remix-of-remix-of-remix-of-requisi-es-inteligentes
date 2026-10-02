-- Creates Ramon's dedicated enteral-diet sector and stores the program selected per request.
alter table public.requisicoes
  add column if not exists programa text;

do $$
declare
  ramon_sector_id integer;
  enteral_categories jsonb := jsonb_build_array('Insumos para Dietas Enterais');
begin
  insert into public.setores (nome, programa, categorias_permitidas)
  select 'RAMON - DIETAS ENTERAIS', null, enteral_categories
  where not exists (
    select 1
    from public.setores
    where public.normalize_shared_sector_text(nome) = 'ramon - dietas enterais'
  );

  select id into ramon_sector_id
  from public.setores
  where public.normalize_shared_sector_text(nome) = 'ramon - dietas enterais'
  order by id
  limit 1;

  update public.usuarios
  set setor = 'RAMON - DIETAS ENTERAIS',
      unidade_nome = 'RAMON - DIETAS ENTERAIS',
      categorias_permitidas = enteral_categories,
      funcao = 'Dietas Enterais',
      updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramon', 'ramonhospital')
     or lower(trim(coalesce(email, ''))) in (
       'ramon@sistemace.com',
       'ramonhospital@usuarios.solicite.local'
     )
     or lower(trim(coalesce(nome, ''))) like '%ramon%';

  if ramon_sector_id is not null then
    insert into public.setor_responsaveis (setor_id, usuario_id)
    select ramon_sector_id, u.id
    from public.usuarios u
    where lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
       or lower(trim(coalesce(u.email, ''))) in (
         'ramon@sistemace.com',
         'ramonhospital@usuarios.solicite.local'
       )
       or lower(trim(coalesce(u.nome, ''))) like '%ramon%'
    on conflict (setor_id, usuario_id) do nothing;
  end if;
end;
$$;

create or replace function public.current_user_can_manage_ramon_request(
  request_solicitante text,
  request_setor text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios u
    where (
        u.auth_user_id = auth.uid()
        or lower(trim(coalesce(u.email, ''))) =
          lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
        or lower(trim(coalesce(u.nome, ''))) like '%ramon%'
      )
  )
  and lower(trim(coalesce(request_solicitante, ''))) like '%ramon%'
  and public.normalize_shared_sector_text(coalesce(request_setor, '')) in (
    'atencao basica', 'hospital', 'casa de apoio', 'ramon - dietas enterais'
  );
$$;

create or replace function public.current_user_can_access_requisicao(
  request_solicitante text,
  request_solicitante_cpf text,
  request_setor text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios u
    where (
        u.auth_user_id = auth.uid()
        or lower(trim(coalesce(u.email, ''))) =
          lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        u.is_admin = true
        or (
          nullif(trim(coalesce(u.cpf, '')), '') is not null
          and nullif(trim(coalesce(u.cpf, '')), '') =
            nullif(trim(coalesce(request_solicitante_cpf, '')), '')
        )
        or (
          lower(trim(coalesce(u.nome, ''))) =
            lower(trim(coalesce(request_solicitante, '')))
          and public.normalize_shared_sector_text(
            coalesce(nullif(trim(u.unidade_nome), ''), nullif(trim(u.setor), ''))
          ) = public.normalize_shared_sector_text(coalesce(request_setor, ''))
        )
        or (
          (
            lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
            or lower(trim(coalesce(u.email, ''))) in (
              'ramon@sistemace.com', 'ramonhospital@usuarios.solicite.local'
            )
            or lower(trim(coalesce(u.nome, ''))) like '%ramon%'
          )
          and lower(trim(coalesce(request_solicitante, ''))) like '%ramon%'
          and public.normalize_shared_sector_text(coalesce(request_setor, '')) in (
            'atencao basica', 'hospital', 'casa de apoio', 'ramon - dietas enterais'
          )
        )
      )
  );
$$;

drop function if exists public.create_ramon_requisicao(text, text, text, text, text, text, jsonb);

create function public.create_ramon_requisicao(
  p_categoria text,
  p_setor text,
  p_programa text,
  p_solicitante text,
  p_solicitante_cpf text,
  p_solicitante_funcao text,
  p_data text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id uuid;
begin
  if public.normalize_shared_sector_text(coalesce(p_setor, '')) <> 'ramon - dietas enterais'
    or lower(trim(coalesce(p_solicitante, ''))) not like '%ramon%'
    or nullif(trim(coalesce(p_programa, '')), '') is null
    or not exists (
      select 1 from public.programas
      where lower(trim(nome)) = lower(trim(p_programa))
    )
    or not public.current_user_can_access_requisicao(
      p_solicitante, p_solicitante_cpf, p_setor
    ) then
    raise exception 'REQUEST_ACCESS_DENIED';
  end if;

  insert into public.requisicoes (
    categoria, setor, programa, solicitante, solicitante_cpf,
    solicitante_funcao, data, status, items, signed_attachment, admin_attachment,
    return_reason, return_target, returned_at
  )
  values (
    'Insumos para Dietas Enterais', 'RAMON - DIETAS ENTERAIS', p_programa,
    p_solicitante, nullif(trim(coalesce(p_solicitante_cpf, '')), ''),
    p_solicitante_funcao, p_data, 'aguardando_assinatura',
    coalesce(p_items, '[]'::jsonb), null, null, null, null, null
  )
  returning id into created_id;

  return created_id;
end;
$$;

grant execute on function public.create_ramon_requisicao(text, text, text, text, text, text, text, jsonb) to authenticated;

create or replace function public.cancel_ramon_pending_requisicao(p_requisicao_id uuid)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.requisicoes r
  set status = 'excluida_usuario', return_reason = null, return_target = null, returned_at = null
  where r.id = p_requisicao_id
    and r.status in ('aguardando_assinatura', 'aguardando_assinatura_requisicao',
      'aguardando_assinatura_saida', 'correcao_requisicao')
    and lower(trim(coalesce(r.solicitante, ''))) like '%ramon%'
    and public.normalize_shared_sector_text(coalesce(r.setor, '')) in (
      'atencao basica', 'hospital', 'casa de apoio', 'ramon - dietas enterais'
    )
    and public.current_user_can_access_requisicao(r.solicitante, r.solicitante_cpf, r.setor)
  returning r.id, r.status;
end;
$$;

create or replace function public.register_ramon_signed_requisicao(
  p_requisicao_id uuid,
  p_signed_attachment jsonb,
  p_admin_attachment jsonb,
  p_status text
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.requisicoes r
  set signed_attachment = p_signed_attachment, admin_attachment = p_admin_attachment,
      status = p_status, return_reason = null, return_target = null, returned_at = null
  where r.id = p_requisicao_id
    and r.status in ('aguardando_assinatura', 'aguardando_assinatura_requisicao',
      'aguardando_assinatura_saida', 'correcao_requisicao')
    and lower(trim(coalesce(r.solicitante, ''))) like '%ramon%'
    and public.normalize_shared_sector_text(coalesce(r.setor, '')) in (
      'atencao basica', 'hospital', 'casa de apoio', 'ramon - dietas enterais'
    )
    and public.current_user_can_access_requisicao(r.solicitante, r.solicitante_cpf, r.setor)
  returning r.id, r.status;
end;
$$;
