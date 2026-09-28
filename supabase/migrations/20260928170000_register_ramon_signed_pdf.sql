-- Registers a signed PDF for Ramon's own pending request after Storage accepts the file.
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
  set signed_attachment = p_signed_attachment,
      admin_attachment = p_admin_attachment,
      status = p_status,
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

revoke all on function public.register_ramon_signed_requisicao(uuid, jsonb, jsonb, text) from public;
grant execute on function public.register_ramon_signed_requisicao(uuid, jsonb, jsonb, text) to authenticated;
