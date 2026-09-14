-- Sends Mae Otavia output 450 from Thainara to Andressa for SIG output signature.
do $$
declare
  target_request_id uuid;
  andressa_profile record;
begin
  select u.nome, u.cpf, u.funcao
  into andressa_profile
  from public.usuarios u
  where public.normalize_shared_sector_text(u.usuario) = 'andressa'
     or public.normalize_shared_sector_text(u.nome) like '%andressa%'
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if andressa_profile.nome is null then
    raise exception 'Cadastro da Andressa nao encontrado.';
  end if;

  select r.id
  into target_request_id
  from public.requisicoes r
  where ltrim(coalesce(r.saida_codigo, ''), '0') = '450'
    and public.normalize_shared_sector_text(r.solicitante) like '%thainara%'
    and public.normalize_shared_sector_text(r.setor) like '%mae otavia%'
  order by r.updated_at desc nulls last, r.created_at desc nulls last
  limit 1;

  if target_request_id is null then
    raise exception 'Saida 450 da Thainara no Mae Otavia nao encontrada.';
  end if;

  update public.requisicoes r
  set
    solicitante = andressa_profile.nome,
    solicitante_cpf = nullif(trim(coalesce(andressa_profile.cpf, '')), ''),
    solicitante_funcao = coalesce(andressa_profile.funcao, r.solicitante_funcao),
    status = 'aguardando_assinatura_saida',
    updated_at = now()
  where r.id = target_request_id;
end;
$$;