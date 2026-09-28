-- Provides a narrow, reliable mutation path for Ramon's own pending requests.
-- It is intentionally limited to Ramon's authenticated profile and approved destination sectors.

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
  if not public.current_user_can_manage_ramon_request(p_solicitante, p_setor) then
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

revoke all on function public.create_ramon_requisicao(text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_ramon_requisicao(text, text, text, text, text, text, jsonb) to authenticated;

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
    and public.current_user_can_manage_ramon_request(r.solicitante, r.setor)
  returning r.id, r.status;
end;
$$;

revoke all on function public.cancel_ramon_pending_requisicao(uuid) from public;
grant execute on function public.cancel_ramon_pending_requisicao(uuid) to authenticated;
