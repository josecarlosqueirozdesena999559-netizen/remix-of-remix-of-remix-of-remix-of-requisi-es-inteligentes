export interface RequestWhatsAppTemplateData {
  requestCode: string;
  materialType?: string | null;
  requestDate?: string | null;
  requesterName?: string | null;
}

export const WHATSAPP_TEMPLATE_LANGUAGE = "pt_BR";

export const WHATSAPP_TEMPLATE_NAMES = {
  welcome: "boas_vindas_almoxarifado",
  requestCreated: "pedido_gerado_assinatura",
  outputAttached: "saida_anexada_pedido",
  readyForPickup: "pedido_pronto_retirada",
} as const;

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

export function buildRequestTemplateParameters(data: RequestWhatsAppTemplateData) {
  return [
    valueOrDash(data.requestCode),
    valueOrDash(data.materialType),
    valueOrDash(data.requestDate),
  ];
}

export function buildWelcomeTemplateParameters(data: { requesterName?: string | null }) {
  return [valueOrDash(data.requesterName)];
}

export function buildWelcomeWhatsAppMessage(data: { requesterName?: string | null } = {}) {
  const requesterName = valueOrDash(data.requesterName);

  return [
    `Olá, ${requesterName}. Bem-vindo ao número oficial do Almoxarifado.`,
    "Por aqui você também receberá notificações para regularizar assinaturas pendentes e saber quando seus pedidos estiverem prontos para retirada.",
  ].join("\n");
}

export function buildRequestCreatedWhatsAppMessage(data: RequestWhatsAppTemplateData) {
  return [
    `Seu pedido número ${valueOrDash(data.requestCode)} foi gerado.`,
    `Tipo de material solicitado: ${valueOrDash(data.materialType)}`,
    `Data: ${valueOrDash(data.requestDate)}`,
    "Por favor, assine a requisição para que o almoxarifado receba o pedido.",
  ].join("\n");
}

export function buildOutputAttachedWhatsAppMessage(data: RequestWhatsAppTemplateData) {
  return [
    `A saída do seu pedido número ${valueOrDash(data.requestCode)} foi gerada pelo almoxarifado.`,
    `Tipo de material solicitado: ${valueOrDash(data.materialType)}`,
    `Data: ${valueOrDash(data.requestDate)}`,
    "Por favor, assine o documento de saída para concluir o processo.",
  ].join("\n");
}

export function buildRequestReadyForPickupWhatsAppMessage(data: RequestWhatsAppTemplateData) {
  return [
    `Seu pedido número ${valueOrDash(data.requestCode)} está pronto para retirada.`,
    `Tipo de material solicitado: ${valueOrDash(data.materialType)}`,
    `Data: ${valueOrDash(data.requestDate)}`,
    "Por favor, venha retirar no almoxarifado.",
  ].join("\n");
}
