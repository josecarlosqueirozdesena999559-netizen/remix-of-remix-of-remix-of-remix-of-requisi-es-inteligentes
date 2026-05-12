create sequence if not exists public.requisicao_global_code_seq
  as bigint
  increment by 1
  minvalue 1
  start with 1
  cache 1;

create or replace function public.assign_requisicao_global_code()
returns trigger
language plpgsql
as $$
begin
  if new.saida_codigo is null or btrim(new.saida_codigo) = '' then
    new.saida_codigo := lpad(nextval('public.requisicao_global_code_seq')::text, 5, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists assign_requisicao_global_code_before_insert on public.requisicoes;

create trigger assign_requisicao_global_code_before_insert
before insert on public.requisicoes
for each row
execute function public.assign_requisicao_global_code();

create unique index if not exists requisicoes_saida_codigo_5_digit_unique_idx
on public.requisicoes (saida_codigo)
where saida_codigo ~ '^\d{5}$';
