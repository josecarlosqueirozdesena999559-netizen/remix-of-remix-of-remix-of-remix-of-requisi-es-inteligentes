export const RESOURCE_TRANSFER_LIMIT_MESSAGE =
  "O limite de transferência de arquivo esgotou. É preciso renovar as credenciais do banco de dados ou realizar uma limpeza dos dados e itens. Limpe o banco de dados ou documentos antigos para melhorias supabase.com. Consumo elevado.";

export function isResourceTransferBlocked() {
  return true;
}
