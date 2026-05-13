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
  requestSigned: "requisicao_assinada",
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
