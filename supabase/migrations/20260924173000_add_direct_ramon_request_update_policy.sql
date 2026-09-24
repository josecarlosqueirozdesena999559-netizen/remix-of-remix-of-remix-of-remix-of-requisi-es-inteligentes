-- Direct RLS fallback for Ramon's authenticated account. It does not depend on
-- which duplicated profile record is returned by the application.
drop policy if exists "Ramon can update own destination requisicoes" on public.requisicoes;
create policy "Ramon can update own destination requisicoes"
on public.requisicoes
for update
to authenticated
using (
  lower(trim(coalesce(auth.jwt() ->> 'email', ''))) in (
    'ramon@sistemace.com',
    'ramonhospital@usuarios.solicite.local'
  )
  and lower(trim(coalesce(solicitante, ''))) like '%ramon%'
  and public.normalize_shared_sector_text(coalesce(setor, '')) in (
    'atencao basica',
    'hospital',
    'casa de apoio'
  )
)
with check (
  lower(trim(coalesce(auth.jwt() ->> 'email', ''))) in (
    'ramon@sistemace.com',
    'ramonhospital@usuarios.solicite.local'
  )
  and lower(trim(coalesce(solicitante, ''))) like '%ramon%'
  and public.normalize_shared_sector_text(coalesce(setor, '')) in (
    'atencao basica',
    'hospital',
    'casa de apoio'
  )
);

create or replace function public.user_owns_requisicao_storage_path(object_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.requisicoes r
    where split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and r.id = split_part(object_name, '/', 2)::uuid
      and (
        public.current_user_can_access_requisicao(r.solicitante, r.solicitante_cpf, r.setor)
        or (
          lower(trim(coalesce(auth.jwt() ->> 'email', ''))) in (
            'ramon@sistemace.com',
            'ramonhospital@usuarios.solicite.local'
          )
          and lower(trim(coalesce(r.solicitante, ''))) like '%ramon%'
          and public.normalize_shared_sector_text(coalesce(r.setor, '')) in (
            'atencao basica',
            'hospital',
            'casa de apoio'
          )
        )
        or (
          public.is_current_user_shared_sector_login()
          and public.can_shared_sector_access_request(r.setor)
        )
      )
  );
$$;
