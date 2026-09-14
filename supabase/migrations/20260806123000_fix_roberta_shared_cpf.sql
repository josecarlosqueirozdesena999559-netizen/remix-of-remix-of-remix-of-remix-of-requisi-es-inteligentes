-- Keeps Roberta requests using the same CPF across Secretaria de Saude and SAMU.
with roberta_cpf as (
  select cpf
  from public.usuarios
  where public.normalize_shared_sector_text(nome) = public.normalize_shared_sector_text('ROBERTA SILVEIRA MACIEL')
    and nullif(btrim(cpf), '') is not null
  order by case when public.normalize_shared_sector_text(unidade_nome) = public.normalize_shared_sector_text('SECRETARIA DE SAUDE') then 0 else 1 end
  limit 1
)
update public.requisicoes r
set solicitante_cpf = roberta_cpf.cpf
from roberta_cpf
where public.normalize_shared_sector_text(r.solicitante) = public.normalize_shared_sector_text('ROBERTA SILVEIRA MACIEL')
  and public.normalize_shared_sector_text(coalesce(r.setor, '')) in (
    public.normalize_shared_sector_text('SECRETARIA DE SAUDE'),
    public.normalize_shared_sector_text('SAMU')
  )
  and nullif(btrim(coalesce(r.solicitante_cpf, '')), '') is null;