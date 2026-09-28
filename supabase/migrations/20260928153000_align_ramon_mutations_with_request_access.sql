-- Aligns Ramon's mutation authorization with the request access rule used by the app.
-- The extra requester and sector checks keep this path limited to Ramon's requests.

create or replace function public.create_ramon_requisicao(
  p_categoria text,
  p_setor text,
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
  if lower(trim(coalesce(p_solicitante, ''))) not like '%ramon%'
    or public.normalize_shared_sector_text(coalesce(p_setor, '')) not in (
      'atencao basica', 'hospital', 'casa de apoio'
    )
    or not public.current_user_can_access_requisicao(
      p_solicitante,
      p_solicitante_cpf,
      p_setor
    ) then
    raise exception 'REQUEST_ACCESS_DENIED';
  end if;

  insert into public.requisicoes (
    categoria, setor, solicitante, solicitante_cpf, solicitante_funcao,
    data, status, items, signed_attachment, admin_attachment,
    return_reason, return_target, returned_at
  )
  values (
    p_categoria, p_setor, p_solicitante,
    nullif(trim(coalesce(p_solicitante_cpf, '')), ''),
    p_solicitante_funcao, p_data, 'aguardando_assinatura',
    coalesce(p_items, '[]'::jsonb), null, null, null, null, null
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.cancel_ramon_pending_requisicao(
  p_requisicao_id uuid
)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.requisicoes r
  set status = 'excluida_usuario',
      return_reason = null,
      return_target = null,
      returned_at = null
  where r.id = p_requisicao_id
    and r.status in (
      'aguardando_assinatura',
      'aguardando_assinatura_requisicao',
      'aguardando_assinatura_saida',
      'correcao_requisicao'
    )
    and lower(trim(coalesce(r.solicitante, ''))) like '%ramon%'
    and public.normalize_shared_sector_text(coalesce(r.setor, '')) in (
      'atencao basica', 'hospital', 'casa de apoio'
    )
    and public.current_user_can_access_requisicao(
      r.solicitante,
      r.solicitante_cpf,
      r.setor
    )
  returning r.id, r.status;
end;
$$;
