-- Expands Ramon's dedicated sector with food, produce and cleaning materials.
do $$
declare
  ramon_categories jsonb := jsonb_build_array(
    'Insumos para Dietas Enterais',
    'Frutas, Verduras e Prote�nas',
    'G�neros aliment�cios/limpeza'
  );
begin
  update public.setores
  set categorias_permitidas = ramon_categories
  where public.normalize_shared_sector_text(nome) = 'ramon - dietas enterais';

  update public.usuarios
  set categorias_permitidas = ramon_categories,
      funcao = 'Dietas Enterais, Frutas, Verduras e Limpeza',
      updated_at = now()
  where lower(trim(coalesce(usuario, ''))) in ('ramon', 'ramonhospital')
     or lower(trim(coalesce(email, ''))) in (
       'ramon@sistemace.com',
       'ramonhospital@usuarios.solicite.local'
     )
     or lower(trim(coalesce(nome, ''))) like '%ramon%';
end;
$$;

create or replace function public.create_ramon_requisicao(
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
    or p_categoria not in (
      'Insumos para Dietas Enterais',
      'Frutas, Verduras e Prote�nas',
      'G�neros aliment�cios/limpeza'
    )
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
    p_categoria, 'RAMON - DIETAS ENTERAIS', p_programa,
    p_solicitante, nullif(trim(coalesce(p_solicitante_cpf, '')), ''),
    p_solicitante_funcao, p_data, 'aguardando_assinatura',
    coalesce(p_items, '[]'::jsonb), null, null, null, null, null
  )
  returning id into created_id;

  return created_id;
end;
$$;
