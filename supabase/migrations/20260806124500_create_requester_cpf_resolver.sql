-- Fill Roberta's CPF on SAMU/Secretaria requests without duplicating CPF in usuarios.
create or replace function public.fill_roberta_shared_request_cpf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  roberta_cpf text;
begin
  if public.normalize_shared_sector_text(coalesce(new.solicitante, '')) <> public.normalize_shared_sector_text('ROBERTA SILVEIRA MACIEL') then
    return new;
  end if;

  if public.normalize_shared_sector_text(coalesce(new.setor, '')) not in (
    public.normalize_shared_sector_text('SECRETARIA DE SAUDE'),
    public.normalize_shared_sector_text('SAMU')
  ) then
    return new;
  end if;

  if nullif(btrim(coalesce(new.solicitante_cpf, '')), '') is not null then
    return new;
  end if;

  select u.cpf
    into roberta_cpf
  from public.usuarios u
  where public.normalize_shared_sector_text(u.nome) = public.normalize_shared_sector_text('ROBERTA SILVEIRA MACIEL')
    and nullif(btrim(coalesce(u.cpf, '')), '') is not null
  order by case
    when public.normalize_shared_sector_text(coalesce(u.unidade_nome, '')) = public.normalize_shared_sector_text('SECRETARIA DE SAUDE') then 0
    else 1
  end
  limit 1;

  if roberta_cpf is not null then
    new.solicitante_cpf := roberta_cpf;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fill_roberta_shared_request_cpf on public.requisicoes;
create trigger trg_fill_roberta_shared_request_cpf
before insert or update of solicitante, setor, solicitante_cpf on public.requisicoes
for each row
execute function public.fill_roberta_shared_request_cpf();