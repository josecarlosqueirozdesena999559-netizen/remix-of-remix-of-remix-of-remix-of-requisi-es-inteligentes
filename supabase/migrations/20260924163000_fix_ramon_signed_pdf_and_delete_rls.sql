-- Allows only Ramon's authenticated account to manage his own requests at the
-- destinations configured for Ramon. This covers signing, PDF attachment, and cancellation.
create or replace function public.current_user_can_access_requisicao(
  request_solicitante text,
  request_solicitante_cpf text,
  request_setor text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuarios u
    where (
        u.auth_user_id = auth.uid()
        or lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        u.is_admin = true
        or (
          nullif(trim(coalesce(u.cpf, '')), '') is not null
          and nullif(trim(coalesce(u.cpf, '')), '') = nullif(trim(coalesce(request_solicitante_cpf, '')), '')
        )
        or (
          lower(trim(coalesce(u.nome, ''))) = lower(trim(coalesce(request_solicitante, '')))
          and (
            public.normalize_shared_sector_text(coalesce(nullif(trim(u.unidade_nome), ''), nullif(trim(u.setor), ''))) =
              public.normalize_shared_sector_text(coalesce(request_setor, ''))
            or exists (
              select 1
              from public.setor_responsaveis sr
              join public.setores s on s.id = sr.setor_id
              where sr.usuario_id = u.id
                and public.normalize_shared_sector_text(s.nome) =
                  public.normalize_shared_sector_text(coalesce(request_setor, ''))
            )
          )
        )
        or (
          (
            lower(trim(coalesce(u.usuario, ''))) in ('ramon', 'ramonhospital')
            or lower(trim(coalesce(u.email, ''))) in (
              'ramon@sistemace.com',
              'ramonhospital@usuarios.solicite.local'
            )
            or lower(trim(coalesce(u.nome, ''))) like '%ramon%'
          )
          and lower(trim(coalesce(request_solicitante, ''))) like '%ramon%'
          and public.normalize_shared_sector_text(coalesce(request_setor, '')) in (
            'atencao basica',
            'hospital',
            'casa de apoio'
          )
        )
      )
  );
$$;

revoke all on function public.current_user_can_access_requisicao(text, text, text) from public;
grant execute on function public.current_user_can_access_requisicao(text, text, text) to authenticated;
