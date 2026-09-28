-- Removes the specific pending request 00549 created by Ramon at the user's request.
update public.requisicoes
set status = 'excluida_usuario',
    return_reason = null,
    return_target = null,
    returned_at = null
where lpad(
    regexp_replace(coalesce(saida_codigo::text, ''), '[^0-9]', '', 'g'),
    5,
    '0'
  ) = '00549'
  and lower(trim(coalesce(solicitante, ''))) like '%ramon%'
  and status in (
    'aguardando_assinatura',
    'aguardando_assinatura_requisicao',
    'aguardando_assinatura_saida',
    'correcao_requisicao'
  );
