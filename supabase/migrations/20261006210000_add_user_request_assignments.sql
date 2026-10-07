alter table public.usuarios
  add column if not exists programa_id uuid,
  add column if not exists materiais_permitidos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_programa_id_fkey'
      and conrelid = 'public.usuarios'::regclass
  ) then
    alter table public.usuarios
      add constraint usuarios_programa_id_fkey
      foreign key (programa_id)
      references public.programas(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists usuarios_programa_id_idx
  on public.usuarios (programa_id);

-- Preserve existing material-category access for regular users while keeping
-- categorias_permitidas available for administrative navigation permissions.
update public.usuarios
set materiais_permitidos = categorias_permitidas
where not is_admin
  and jsonb_typeof(categorias_permitidas) = 'array'
  and case
    when jsonb_typeof(categorias_permitidas) = 'array'
      then jsonb_array_length(categorias_permitidas) > 0
    else false
  end
  and materiais_permitidos = '[]'::jsonb;

comment on column public.usuarios.programa_id is
  'Programa principal autorizado para solicitações feitas pelo usuário.';
comment on column public.usuarios.materiais_permitidos is
  'Lista de categorias de materiais que o usuário pode solicitar.';
