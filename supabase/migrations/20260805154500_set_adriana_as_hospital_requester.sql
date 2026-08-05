-- Makes Adriana request through the shared hospital login with hospital material permissions.
do $$
declare
  hospital_categories jsonb := jsonb_build_array('Ambulatorial', 'Expediente');
begin
  update public.usuarios u
  set
    auth_user_id = null,
    usuario = coalesce(nullif(trim(usuario), ''), 'adrianacavalcante'),
    setor = 'HOSPITAL',
    unidade_nome = 'HOSPITAL',
    categorias_permitidas = hospital_categories,
    updated_at = now()
  where lower(trim(coalesce(u.nome, ''))) = 'adriana carlos cavalcante'
     or lower(trim(coalesce(u.email, ''))) = 'adrianacavalcante@usuarios.solicite.local';

  update public.setores s
  set categorias_permitidas = hospital_categories
  where lower(trim(coalesce(s.nome, ''))) = 'hospital';
end;
$$;
