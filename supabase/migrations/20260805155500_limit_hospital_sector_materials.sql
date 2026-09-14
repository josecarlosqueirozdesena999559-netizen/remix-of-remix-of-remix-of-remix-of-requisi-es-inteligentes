-- Restricts all HOSPITAL sector requesters to Ambulatorial and Expediente only.
do $$
declare
  hospital_categories jsonb := jsonb_build_array('Ambulatorial', 'Expediente');
begin
  update public.setores s
  set categorias_permitidas = hospital_categories
  where lower(trim(coalesce(s.nome, ''))) = 'hospital';

  update public.usuarios u
  set
    categorias_permitidas = hospital_categories,
    updated_at = now()
  where lower(trim(coalesce(u.usuario, ''))) = 'hospital'
     or lower(trim(coalesce(u.setor, ''))) = 'hospital'
     or lower(trim(coalesce(u.unidade_nome, ''))) = 'hospital';
end;
$$;