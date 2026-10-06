-- Correct the category text used by Ramon's dedicated profile and sector.
-- Older clients may still send replacement-character variants; the RPC accepts
-- those aliases but always persists the canonical UTF-8 category label.
do $$
declare
  canonical_categories jsonb := jsonb_build_array(
    'Insumos para Dietas Enterais',
    'Frutas, Verduras e Proteínas',
    'Gêneros alimentícios/limpeza'
  );
  sector_count integer;
  ramon_user_count integer;
begin
  select count(*)
    into sector_count
    from public.setores
   where lower(trim(nome)) = 'ramon - dietas enterais';

  if sector_count <> 1 then
    raise exception 'Expected exactly one dedicated Ramon sector; found %', sector_count;
  end if;

  select count(*)
    into ramon_user_count
    from public.usuarios
   where lower(trim(coalesce(usuario, ''))) = 'ramon'
     and lower(trim(coalesce(setor, ''))) = 'ramon - dietas enterais';

  if ramon_user_count <> 1 then
    raise exception 'Expected exactly one Ramon profile in the dedicated sector; found %', ramon_user_count;
  end if;

  update public.setores
     set categorias_permitidas = canonical_categories
   where lower(trim(nome)) = 'ramon - dietas enterais';

  update public.usuarios
     set categorias_permitidas = canonical_categories,
         funcao = 'Dietas Enterais, Frutas, Verduras e Limpeza',
         updated_at = now()
   where lower(trim(coalesce(usuario, ''))) = 'ramon'
     and lower(trim(coalesce(setor, ''))) = 'ramon - dietas enterais';
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
  canonical_categoria text;
begin
  canonical_categoria := case
    when p_categoria = 'Insumos para Dietas Enterais'
      then 'Insumos para Dietas Enterais'
    when p_categoria = 'Frutas, Verduras e Proteínas'
      or p_categoria = ('Frutas, Verduras e Prote' || chr(65533) || 'nas')
      then 'Frutas, Verduras e Proteínas'
    when p_categoria = 'Gêneros alimentícios/limpeza'
      or p_categoria = ('G' || chr(65533) || 'neros aliment' || chr(65533) || 'cios/limpeza')
      then 'Gêneros alimentícios/limpeza'
    else null
  end;

  if public.normalize_shared_sector_text(coalesce(p_setor, '')) <> 'ramon - dietas enterais'
    or lower(trim(coalesce(p_solicitante, ''))) not like '%ramon%'
    or canonical_categoria is null
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
    canonical_categoria, 'RAMON - DIETAS ENTERAIS', p_programa,
    p_solicitante, nullif(trim(coalesce(p_solicitante_cpf, '')), ''),
    p_solicitante_funcao, p_data, 'aguardando_assinatura',
    coalesce(p_items, '[]'::jsonb), null, null, null, null, null
  )
  returning id into created_id;

  return created_id;
end;
$$;
