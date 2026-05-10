import "@tanstack/react-start/server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_GRAPH_API_VERSION = "v25.0";
const WHATSAPP_MESSAGES_PATH = "messages";
const WHATSAPP_SETTING_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_GRAPH_API_VERSION",
] as const;

export interface WhatsAppTextMessageInput {
  to: string;
  body: string;
  previewUrl?: boolean;
}

export interface WhatsAppTemplateMessageInput {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: Array<string | number | null | undefined>;
}

export interface WhatsAppMessageResult {
  messageId: string;
  contactWaId?: string;
}

type WhatsAppMessagesResponse = {
  contacts?: Array<{ wa_id?: string }>;
  messages?: Array<{ id?: string }>;
};

type WhatsAppErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type WhatsAppSettingKey = (typeof WHATSAPP_SETTING_KEYS)[number];

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

function getEnvValue(name: WhatsAppSettingKey) {
  const value = process.env[name]?.trim();
  return value || null;
}

async function getAppSettings() {
  const { data, error } = await (supabaseAdmin as any)
    .from("app_settings")
    .select("key,value")
    .in("key", WHATSAPP_SETTING_KEYS);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as Array<{ key: WhatsAppSettingKey; value: string }>).map((setting) => [
      setting.key,
      setting.value,
    ]),
  );
}

async function getWhatsAppConfig() {
  const envAccessToken = getEnvValue("WHATSAPP_ACCESS_TOKEN");
  const envPhoneNumberId = getEnvValue("WHATSAPP_PHONE_NUMBER_ID");
  const envGraphApiVersion = getEnvValue("WHATSAPP_GRAPH_API_VERSION");

  const appSettings = await getAppSettings();
  const accessToken = appSettings.get("WHATSAPP_ACCESS_TOKEN")?.trim() || envAccessToken;
  const phoneNumberId = appSettings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() || envPhoneNumberId;
  const graphApiVersion =
    appSettings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    envGraphApiVersion ||
    DEFAULT_GRAPH_API_VERSION;

  const missing = [
    ...(!accessToken ? ["WHATSAPP_ACCESS_TOKEN"] : []),
    ...(!phoneNumberId ? ["WHATSAPP_PHONE_NUMBER_ID"] : []),
  ];

  if (missing.length) {
    throw new Error(`Missing WhatsApp setting(s): ${missing.join(", ")}`);
  }

  return {
    accessToken,
    phoneNumberId,
    graphApiVersion,
  };
}

export function clearWhatsAppConfigCache() {
  return;
}

function getWhatsAppRequestUrl(config: WhatsAppConfig) {
  return {
    url: `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/${WHATSAPP_MESSAGES_PATH}`,
  };
}

export function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("Telefone do WhatsApp inválido. Informe DDI + DDD + número.");
  }

  return digits;
}

export function buildRequestReadyWhatsAppMessage(input: {
  requestCode: string;
  requestType?: string | null;
}) {
  const requestType = input.requestType?.trim() || "requisição";

  return [
    `Seu pedido número ${input.requestCode}, tipo ${requestType}, está separado.`,
    "Por favor, venha retirar no almoxarifado.",
  ].join("\n");
}

export async function sendWhatsAppTextMessage({
  to,
  body,
  previewUrl = false,
}: WhatsAppTextMessageInput): Promise<WhatsAppMessageResult> {
  const config = await getWhatsAppConfig();
  const { url } = getWhatsAppRequestUrl(config);
  const recipient = normalizeWhatsAppPhoneNumber(to);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: {
        preview_url: previewUrl,
        body,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | WhatsAppMessagesResponse
    | WhatsAppErrorResponse
    | null;

  if (!response.ok) {
    const errorPayload = payload as WhatsAppErrorResponse | null;
    const error = errorPayload?.error;
    const details = [
      error?.message || `Erro ${response.status} ao enviar WhatsApp.`,
      error?.code ? `code=${error.code}` : "",
      error?.error_subcode ? `subcode=${error.error_subcode}` : "",
      error?.fbtrace_id ? `trace=${error.fbtrace_id}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    throw new Error(details);
  }

  const successPayload = payload as WhatsAppMessagesResponse | null;
  const messageId = successPayload?.messages?.[0]?.id;

  if (!messageId) {
    throw new Error("WhatsApp enviado, mas a resposta não retornou o id da mensagem.");
  }

  return {
    messageId,
    contactWaId: successPayload?.contacts?.[0]?.wa_id,
  };
}

export async function sendWhatsAppTemplateMessage({
  to,
  templateName,
  languageCode = "pt_BR",
  bodyParameters = [],
}: WhatsAppTemplateMessageInput): Promise<WhatsAppMessageResult> {
  const config = await getWhatsAppConfig();
  const { url } = getWhatsAppRequestUrl(config);
  const recipient = normalizeWhatsAppPhoneNumber(to);
  const parameters = bodyParameters.map((value) => ({
    type: "text",
    text: String(value ?? "-"),
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        ...(parameters.length
          ? {
              components: [
                {
                  type: "body",
                  parameters,
                },
              ],
            }
          : {}),
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | WhatsAppMessagesResponse
    | WhatsAppErrorResponse
    | null;

  if (!response.ok) {
    const errorPayload = payload as WhatsAppErrorResponse | null;
    const error = errorPayload?.error;
    const details = [
      error?.message || `Erro ${response.status} ao enviar template WhatsApp.`,
      error?.code ? `code=${error.code}` : "",
      error?.error_subcode ? `subcode=${error.error_subcode}` : "",
      error?.fbtrace_id ? `trace=${error.fbtrace_id}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    throw new Error(details);
  }

  const successPayload = payload as WhatsAppMessagesResponse | null;
  const messageId = successPayload?.messages?.[0]?.id;

  if (!messageId) {
    throw new Error("WhatsApp enviado, mas a resposta não retornou o id da mensagem.");
  }

  return {
    messageId,
    contactWaId: successPayload?.contacts?.[0]?.wa_id,
  };
}
