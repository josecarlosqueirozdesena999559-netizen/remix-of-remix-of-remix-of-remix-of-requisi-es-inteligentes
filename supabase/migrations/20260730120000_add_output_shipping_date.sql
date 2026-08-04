alter table public.requisicoes
  add column if not exists saida_data_envio date;

comment on column public.requisicoes.saida_data_envio is
  'Data de envio registrada no documento de saída pelo administrador.';
