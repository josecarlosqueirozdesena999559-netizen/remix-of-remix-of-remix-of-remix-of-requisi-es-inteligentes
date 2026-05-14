import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "npm:@zxing/library@0.21.3";
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const WHATSAPP_TEMPLATE_LANGUAGE = "pt_BR";
const READY_TEMPLATE_NAME = "pedido_pronto_retirada";
const CONFIRM_BUTTON_ID = "confirmar_retirada";
const ADMIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const USER_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const ADMIN_KEEPALIVE_BUTTON_IDS = ["admin_keepalive_confirmar", "abrir_janela_24h_admin"];
const ADMIN_KEEPALIVE_BUTTON_TITLES = [
  "abrir janela 24h",
  "confirmar janela",
  "confirmar recebimento",
];
const WEBHOOK_LAST_POST_AT_KEY = "WHATSAPP_WEBHOOK_LAST_POST_AT";
const WEBHOOK_LAST_POST_SUMMARY_KEY = "WHATSAPP_WEBHOOK_LAST_POST_SUMMARY";
const WEBHOOK_LAST_ERROR_AT_KEY = "WHATSAPP_WEBHOOK_LAST_ERROR_AT";
const WEBHOOK_LAST_ERROR_KEY = "WHATSAPP_WEBHOOK_LAST_ERROR";
const SETTINGS_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_ADMIN_NUMBERS",
];

type AppSetting = {
  key: string;
  value: string;
};

type RequestQrPayload = {
  kind?: string;
  version?: number;
  requestId?: string;
  requestCode?: string;
  materialType?: string;
  program?: string;
  requester?: string;
  requesterCpf?: string;
  requestDate?: string;
};

type PendingConfirmation = {
  qrPayload: string;
  createdAt: string;
  request: {
    id: string;
    requestCode: string;
    materialType: string;
    requester: string;
    requesterCpf: string;
    requestDate: string;
  };
};

type RequisicaoRow = {
  id: string;
  saida_codigo: string | null;
  categoria: string | null;
  data: string | null;
  created_at: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
};

type RequestCodeSource = {
  id: string;
  saida_codigo: string | null;
  data: string | null;
  created_at: string | null;
};

type WhatsAppStatusAuditRow = {
  message_id: string;
  recipient_id: string | null;
  status: string;
  occurred_at: string | null;
  conversation_id: string | null;
  conversation_origin: string | null;
  pricing_category: string | null;
  pricing_model: string | null;
  pricing_billable: boolean | null;
  error_summary: string | null;
  raw_payload: unknown;
};

type WhatsAppMessageAuditRow = {
  message_id: string;
  sender_id: string | null;
  message_type: string | null;
  body: string | null;
  occurred_at: string | null;
  raw_payload: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function hasAttachmentFile(value: unknown) {
  if (!isRecord(value)) return false;

  return Boolean(
    typeof value.storagePath === "string" ||
      typeof value.fileName === "string" ||
      typeof value.url === "string" ||
      typeof value.publicUrl === "string" ||
      typeof value.signedUrl === "string",
  );
}

function hasOutputAttachment(requisicao: RequisicaoRow) {
  if (hasAttachmentFile(requisicao.admin_attachment)) return true;

  if (isRecord(requisicao.signed_attachment)) {
    if (hasAttachmentFile(requisicao.signed_attachment.output)) return true;
    if (!("request" in requisicao.signed_attachment) && requisicao.status === "concluido") {
      return hasAttachmentFile(requisicao.signed_attachment);
    }
  }

  return false;
}

function shouldUseAdminPendingOutputCode(requisicao: RequisicaoRow) {
  return (
    !hasOutputAttachment(requisicao) &&
    (requisicao.status === "recebido" ||
      requisicao.status === "requisicao_assinada" ||
      requisicao.status === "concluido" ||
      requisicao.status === "aguardando_assinatura_saida")
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain",
    },
  });
}

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return digits;

  throw new Error("WhatsApp inválido.");
}

function parseAdminNumbers(value: string) {
  const normalizedValue = value.trim();
  const rawNumbers =
    /[\n,;]/.test(normalizedValue) || !normalizedValue.includes("55")
      ? normalizedValue
          .split(/[\n,;]+/)
          .map((number) => number.trim())
          .filter(Boolean)
      : normalizedValue.match(/55\d{10,11}(?=55|$)/g) ?? [];

  return rawNumbers
    .map((number) => normalizePhoneNumber(number))
    .filter((number, index, numbers) => numbers.indexOf(number) === index);
}

function getBrazilianPhoneVariants(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const variants = new Set<string>([digits]);

  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }

  if (digits.startsWith("55") && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }

  return variants;
}

function isAuthorizedAdminNumber(from: string, adminNumbers: string[]) {
  const fromVariants = getBrazilianPhoneVariants(from);
  return adminNumbers.some((adminNumber) => {
    const adminVariants = getBrazilianPhoneVariants(adminNumber);
    return [...fromVariants].some((variant) => adminVariants.has(variant));
  });
}

function normalizeComparisonValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== "-" ? normalized : null;
}

function pendingKey(phone: string) {
  return `WHATSAPP_PENDING_QR_${phone}`;
}

function pendingKeys(phone: string) {
  return [...getBrazilianPhoneVariants(phone)].map(pendingKey);
}

function adminSessionKeys(phone: string) {
  return [...getBrazilianPhoneVariants(phone)].map((variant) => `WHATSAPP_ADMIN_SESSION_${variant}`);
}

function userSessionKeys(phone: string) {
  return [...getBrazilianPhoneVariants(phone)].map((variant) => `WHATSAPP_USER_SESSION_${variant}`);
}

function parseQrPayload(value: string) {
  const parsed = JSON.parse(value) as RequestQrPayload;

  if (
    parsed.kind !== "almoxarifado_requisicao" ||
    parsed.version !== 1 ||
    !parsed.requestId
  ) {
    throw new Error("QR Code de requisição inválido.");
  }

  return parsed;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase não configurado.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? `Erro ${response.status} ao consultar Supabase.`);
  }

  return payload;
}

async function getSettings() {
  const rows = (await supabaseFetch(
    `app_settings?select=key,value&key=in.(${SETTINGS_KEYS.join(",")})`,
  )) as AppSetting[];

  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const accessToken =
    settings.get("WHATSAPP_ACCESS_TOKEN")?.trim() ||
    Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId =
    settings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() ||
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const graphApiVersion =
    settings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    "v25.0";
  const verifyToken =
    settings.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN")?.trim() ||
    Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN")?.trim();
  const adminNumbers = parseAdminNumbers(settings.get("WHATSAPP_ADMIN_NUMBERS") || "");

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp não configurado.");
  }

  return { accessToken, phoneNumberId, graphApiVersion, verifyToken, adminNumbers };
}

async function upsertSetting(key: string, value: string) {
  await supabaseFetch("app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key, value }),
  });
}

async function deleteSetting(key: string) {
  await supabaseFetch(`app_settings?key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

async function getSetting(key: string) {
  const rows = (await supabaseFetch(
    `app_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`,
  )) as Array<{ value: string }>;

  return rows[0]?.value || "";
}

async function upsertPendingConfirmation(phone: string, pending: PendingConfirmation) {
  await Promise.all(pendingKeys(phone).map((key) => upsertSetting(key, JSON.stringify(pending))));
}

async function getPendingConfirmation(phone: string) {
  for (const key of pendingKeys(phone)) {
    const value = await getSetting(key);
    if (value) return value;
  }

  return "";
}

async function deletePendingConfirmation(phone: string) {
  await Promise.all(pendingKeys(phone).map((key) => deleteSetting(key)));
}

async function markAdminSessionActive(phone: string) {
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS).toISOString();
  await Promise.all(adminSessionKeys(phone).map((key) => upsertSetting(key, expiresAt)));
  return expiresAt;
}

async function markUserSessionActive(phone: string) {
  const expiresAt = new Date(Date.now() + USER_SESSION_DURATION_MS).toISOString();
  await Promise.all(userSessionKeys(phone).map((key) => upsertSetting(key, expiresAt)));
  return expiresAt;
}

function parseStatusTimestamp(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const unixSeconds = Number(raw);
  if (Number.isFinite(unixSeconds) && unixSeconds > 0) {
    return new Date(unixSeconds * 1000).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildStatusErrorSummary(errors: unknown) {
  if (!Array.isArray(errors) || !errors.length) return null;

  return errors
    .map((error) => {
      if (!isRecord(error)) return String(error);

      return [
        typeof error.title === "string" ? error.title : "",
        typeof error.message === "string" ? error.message : "",
        typeof error.code === "number" || typeof error.code === "string"
          ? `code=${error.code}`
          : "",
        typeof error.error_data?.details === "string" ? error.error_data.details : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join(" | ");
}

function extractStatuses(payload: any): WhatsAppStatusAuditRow[] {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  return entries.flatMap((entry: any) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change: any) =>
      (Array.isArray(change?.value?.statuses) ? change.value.statuses : [])
        .map((status: any) => {
          const messageId = String(status?.id || "").trim();
          const state = String(status?.status || "").trim();
          if (!messageId || !state) return null;

          return {
            message_id: messageId,
            recipient_id:
              typeof status?.recipient_id === "string" ? status.recipient_id.trim() || null : null,
            status: state,
            occurred_at: parseStatusTimestamp(status?.timestamp),
            conversation_id:
              typeof status?.conversation?.id === "string"
                ? status.conversation.id.trim() || null
                : null,
            conversation_origin:
              typeof status?.conversation?.origin?.type === "string"
                ? status.conversation.origin.type.trim() || null
                : null,
            pricing_category:
              typeof status?.pricing?.category === "string"
                ? status.pricing.category.trim() || null
                : null,
            pricing_model:
              typeof status?.pricing?.pricing_model === "string"
                ? status.pricing.pricing_model.trim() || null
                : null,
            pricing_billable:
              typeof status?.pricing?.billable === "boolean" ? status.pricing.billable : null,
            error_summary: buildStatusErrorSummary(status?.errors),
            raw_payload: status,
          } satisfies WhatsAppStatusAuditRow;
        })
        .filter(Boolean),
    ),
  );
}

function extractMessageBody(message: any) {
  if (typeof message?.text?.body === "string") return message.text.body;
  if (typeof message?.button?.text === "string") return message.button.text;
  if (typeof message?.button?.payload === "string") return message.button.payload;
  if (typeof message?.interactive?.button_reply?.title === "string") {
    return message.interactive.button_reply.title;
  }
  if (typeof message?.interactive?.button_reply?.id === "string") {
    return message.interactive.button_reply.id;
  }

  return null;
}

function buildMessageAuditRows(messages: any[]): WhatsAppMessageAuditRow[] {
  return messages
    .map((message: any) => {
      const messageId = String(message?.id || "").trim();
      if (!messageId) return null;

      return {
        message_id: messageId,
        sender_id: typeof message?.from === "string" ? message.from.trim() || null : null,
        message_type: typeof message?.type === "string" ? message.type.trim() || null : null,
        body: extractMessageBody(message),
        occurred_at: parseStatusTimestamp(message?.timestamp),
        raw_payload: message,
      } satisfies WhatsAppMessageAuditRow;
    })
    .filter(Boolean);
}

async function insertMessageAuditRows(rows: WhatsAppMessageAuditRow[]) {
  if (!rows.length) return;

  await supabaseFetch("whatsapp_webhook_message_audit", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function insertStatusAuditRows(rows: WhatsAppStatusAuditRow[]) {
  if (!rows.length) return;

  await supabaseFetch("whatsapp_webhook_status_audit", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
}

async function sendReadyTemplate(input: {
  to: string;
  requestCode: string;
  materialType: string;
  requestDate: string;
}) {
  const config = await getSettings();
  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(input.to),
        type: "template",
        template: {
          name: READY_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.requestCode },
                { type: "text", text: input.materialType },
                { type: "text", text: input.requestDate },
              ],
            },
          ],
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar WhatsApp.");
  }

  return payload?.messages?.[0]?.id as string | undefined;
}

async function sendTextMessage(input: { to: string; text: string }) {
  const config = await getSettings();
  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizePhoneNumber(input.to),
        type: "text",
        text: {
          preview_url: false,
          body: input.text,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar WhatsApp.");
  }

  return payload?.messages?.[0]?.id as string | undefined;
}

async function downloadMedia(mediaId: string) {
  const config = await getSettings();
  const mediaResponse = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    },
  );
  const media = await mediaResponse.json().catch(() => null);

  if (!mediaResponse.ok || !media?.url) {
    throw new Error(media?.error?.message || "Não foi possível baixar a imagem.");
  }

  const fileResponse = await fetch(media.url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  if (!fileResponse.ok) {
    throw new Error("Não foi possível baixar a foto do QR Code.");
  }

  return new Uint8Array(await fileResponse.arrayBuffer());
}

async function decodeQrFromImage(bytes: Uint8Array) {
  const image = await Image.decode(bytes);
  const grayscale = new Uint8ClampedArray(image.width * image.height);

  for (let pixel = 0, offset = 0; pixel < grayscale.length; pixel += 1, offset += 4) {
    const red = image.bitmap[offset] || 0;
    const green = image.bitmap[offset + 1] || 0;
    const blue = image.bitmap[offset + 2] || 0;
    grayscale[pixel] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  const source = new RGBLuminanceSource(grayscale, image.width, image.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  return new QRCodeReader().decode(bitmap).getText();
}

async function getRequestByQrPayload(qrPayloadText: string) {
  const qrPayload = parseQrPayload(qrPayloadText);
  const rows = (await supabaseFetch(
    `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,status,signed_attachment,admin_attachment&id=eq.${encodeURIComponent(
      qrPayload.requestId,
    )}&limit=1`,
  )) as RequisicaoRow[];

  const requisicao = rows[0];
  if (!requisicao) throw new Error("Requisição não encontrada.");

  const requestCode = requisicao.saida_codigo || requisicao.id;
  const qrRequestCode = normalizeComparisonValue(qrPayload.requestCode);
  if (qrRequestCode && qrRequestCode !== requestCode) {
    throw new Error("QR Code não confere com a requisição encontrada.");
  }

  assertRequestCanBeMarkedReady(requisicao);
  return buildRequestLookupResult(requisicao, qrPayload);
}

function buildRequestLookupResult(requisicao: RequisicaoRow, qrPayload?: RequestQrPayload) {
  const requestCode = requisicao.saida_codigo || requisicao.id;

  return {
    qrPayload,
    requisicao,
    request: {
      id: requisicao.id,
      requestCode: valueOrDash(requestCode),
      materialType: valueOrDash(requisicao.categoria || qrPayload?.materialType),
      requester: valueOrDash(requisicao.solicitante || qrPayload?.requester),
      requesterCpf: valueOrDash(requisicao.solicitante_cpf || qrPayload?.requesterCpf),
      requestDate: valueOrDash(requisicao.data || qrPayload?.requestDate),
    },
  };
}

function buildQrPayloadTextFromRequest(requisicao: RequisicaoRow) {
  const requestCode = requisicao.saida_codigo || requisicao.id;
  return JSON.stringify({
    kind: "almoxarifado_requisicao",
    version: 1,
    requestId: requisicao.id,
    requestCode: valueOrDash(requestCode),
    materialType: valueOrDash(requisicao.categoria),
    requester: valueOrDash(requisicao.solicitante),
    requesterCpf: valueOrDash(requisicao.solicitante_cpf),
    requestDate: valueOrDash(requisicao.data),
  });
}

function normalizeManualCode(value: string) {
  const code = value
    .trim()
    .replace(/^c[oó]digo\s*[:#-]?\s*/i, "")
    .replace(/^cod\s*[:#-]?\s*/i, "")
    .trim();

  return /^\d{1,5}$/.test(code) ? code.padStart(5, "0") : code;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function assertRequestCanBeMarkedReady(requisicao: RequisicaoRow) {
  const requestCode = requisicao.saida_codigo || requisicao.id;

  if (
    requisicao.status === "aguardando_assinatura" ||
    requisicao.status === "aguardando_assinatura_requisicao"
  ) {
    throw new Error(
      `Pedido ${requestCode} ainda está aguardando assinatura do usuário. Depois que o usuário assinar, envie o COD novamente.`,
    );
  }

  if (requisicao.status === "correcao_requisicao") {
    throw new Error(
      `Pedido ${requestCode} está em correção. Finalize a correção antes de confirmar retirada.`,
    );
  }

  if (requisicao.status === "pronto_retirada") {
    throw new Error(`Pedido ${requestCode} já está marcado como pronto para retirada.`);
  }

  if (!hasOutputAttachment(requisicao)) {
    throw new Error(
      `Pedido ${requestCode} ainda não tem documento de saída anexado. Anexe a saída antes de confirmar retirada.`,
    );
  }
}

async function getRequestByManualCode(rawCode: string) {
  const code = normalizeManualCode(rawCode);
  if (!code) throw new Error("Digite o código que aparece abaixo do QR Code.");

  const rowsByCode = (await supabaseFetch(
    `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,status,signed_attachment,admin_attachment&saida_codigo=eq.${encodeURIComponent(
      code,
    )}&limit=1`,
  )) as RequisicaoRow[];

  let requisicao = rowsByCode[0];

  if (!requisicao && isUuid(code)) {
    const rowsById = (await supabaseFetch(
      `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,status,signed_attachment,admin_attachment&id=eq.${encodeURIComponent(
        code,
      )}&limit=1`,
    )) as RequisicaoRow[];
    requisicao = rowsById[0];
  }

  if (!requisicao) {
    throw new Error("Código não encontrado. Confira o COD abaixo do QR Code e envie novamente.");
  }

  assertRequestCanBeMarkedReady(requisicao);
  return buildRequestLookupResult(requisicao);
}

async function getRequestByAdminPendingOutputCode(rawCode: string) {
  const code = normalizeManualCode(rawCode);
  if (!code) throw new Error("Digite o codigo que aparece abaixo do QR Code.");

  const rowsByPendingOutputCode = (await supabaseFetch(
    `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,status,signed_attachment,admin_attachment&saida_codigo=eq.${encodeURIComponent(
      code,
    )}&limit=1`,
  )) as RequisicaoRow[];
  const requisicao = rowsByPendingOutputCode[0];

  if (!requisicao || !shouldUseAdminPendingOutputCode(requisicao)) {
    throw new Error("Codigo nao encontrado. Confira o COD abaixo do QR Code e envie novamente.");
  }

  assertRequestCanBeMarkedReady(requisicao);
  return buildRequestLookupResult(requisicao);
}

async function findRequesterWhatsApp(input: {
  solicitanteCpf: string | null;
  solicitante: string | null;
}) {
  if (input.solicitanteCpf) {
    const cpfDigits = input.solicitanteCpf.replace(/\D/g, "");
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp&cpf=eq.${encodeURIComponent(input.solicitanteCpf)}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null }>;
    if (users[0]) return users[0];

    if (cpfDigits && cpfDigits !== input.solicitanteCpf) {
      const usersByDigits = (await supabaseFetch(
        `usuarios?select=nome,whatsapp&cpf=eq.${encodeURIComponent(cpfDigits)}&limit=1`,
      )) as Array<{ nome: string | null; whatsapp: string | null }>;
      if (usersByDigits[0]) return usersByDigits[0];
    }
  }

  if (input.solicitante) {
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp&nome=eq.${encodeURIComponent(input.solicitante)}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null }>;
    if (users[0]) return users[0];

    const usersByName = (await supabaseFetch(
      `usuarios?select=nome,whatsapp&nome=ilike.${encodeURIComponent(
        `%${input.solicitante.trim()}%`,
      )}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null }>;
    if (usersByName[0]) return usersByName[0];
  }

  return undefined;
}

async function confirmPending(pending: PendingConfirmation) {
  const { requisicao, request } = await getRequestByQrPayload(pending.qrPayload);

  await supabaseFetch(`requisicoes?id=eq.${encodeURIComponent(requisicao.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "pronto_retirada",
      updated_at: new Date().toISOString(),
    }),
  });

  const user = await findRequesterWhatsApp({
    solicitanteCpf: requisicao.solicitante_cpf,
    solicitante: requisicao.solicitante,
  });

  let messageId: string | undefined;
  let notificationSkippedReason: string | undefined;

  if (user?.whatsapp?.trim()) {
    try {
      messageId = await sendReadyTemplate({
        to: user.whatsapp,
        requestCode: request.requestCode,
        materialType: request.materialType,
        requestDate: request.requestDate,
      });
    } catch (error) {
      notificationSkippedReason =
        error instanceof Error
          ? `Não foi possível avisar o usuário no WhatsApp: ${error.message}`
          : "Não foi possível avisar o usuário no WhatsApp.";
    }
  } else {
    notificationSkippedReason = "Usuário sem WhatsApp cadastrado.";
  }

  return { request, messageId, notificationSkippedReason };
}

async function savePendingAndAskConfirmation(from: string, pending: PendingConfirmation) {
  await upsertPendingConfirmation(from, pending);
}

async function handleImageMessage(from: string, mediaId: string) {
  const image = await downloadMedia(mediaId);
  const qrText = await decodeQrFromImage(image);
  const { request } = await getRequestByQrPayload(qrText);
  const pending: PendingConfirmation = {
    qrPayload: qrText,
    createdAt: new Date().toISOString(),
    request,
  };

  await savePendingAndAskConfirmation(from, pending);
}

async function handleTextMessage(from: string, text: string) {
  const normalized = text.trim().toLowerCase();

  if (!["confirmar", "confirma", "sim"].includes(normalized)) {
    let lookupResult: Awaited<ReturnType<typeof getRequestByManualCode>>;

    try {
      lookupResult = await getRequestByManualCode(text);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("COD abaixo do QR Code")
      ) {
        throw error;
      }

      lookupResult = await getRequestByAdminPendingOutputCode(text);
    }

    const { requisicao, request } = lookupResult;
    await savePendingAndAskConfirmation(from, {
      qrPayload: buildQrPayloadTextFromRequest(requisicao),
      createdAt: new Date().toISOString(),
      request,
    });
    return;
  }

  await handleConfirmation(from);
}

async function handleConfirmation(from: string) {
  const pendingRaw = await getPendingConfirmation(from);
  if (!pendingRaw) {
    return;
  }

  const pending = JSON.parse(pendingRaw) as PendingConfirmation;
  await confirmPending(pending);
  await deletePendingConfirmation(from);
}

function matchesAdminKeepaliveButton(message: any) {
  const interactiveId = String(message?.interactive?.button_reply?.id || "").trim().toLowerCase();
  const interactiveTitle = String(message?.interactive?.button_reply?.title || "").trim().toLowerCase();
  const buttonPayload = String(message?.button?.payload || "").trim().toLowerCase();
  const buttonText = String(message?.button?.text || "").trim().toLowerCase();

  return (
    ADMIN_KEEPALIVE_BUTTON_IDS.includes(interactiveId) ||
    ADMIN_KEEPALIVE_BUTTON_IDS.includes(buttonPayload) ||
    ADMIN_KEEPALIVE_BUTTON_TITLES.includes(interactiveTitle) ||
    ADMIN_KEEPALIVE_BUTTON_TITLES.includes(buttonText)
  );
}

async function handleAdminKeepalive(from: string) {
  await markAdminSessionActive(from);
  await sendTextMessage({
    to: from,
    text:
      "Recebido. Sua janela de mensagens ficou aberta por 24 horas a partir desta resposta. Os alertas do sistema podem ser enviados normalmente durante esse período.",
  });
}

function extractMessages(payload: any) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  return entries.flatMap((entry: any) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change: any) =>
      Array.isArray(change?.value?.messages) ? change.value.messages : [],
    ),
  );
}

function buildWebhookPayloadSummary(payload: any, messages: any[], statuses: WhatsAppStatusAuditRow[]) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const changes = entries.flatMap((entry: any) => (Array.isArray(entry?.changes) ? entry.changes : []));
  const senders = Array.from(
    new Set(
      messages
        .map((message: any) => String(message?.from || "").trim())
        .filter(Boolean)
        .slice(0, 10),
    ),
  );

  return JSON.stringify({
    receivedAt: new Date().toISOString(),
    entryCount: entries.length,
    changeCount: changes.length,
    messageCount: messages.length,
    statusCount: statuses.length,
    senders,
    topLevelKeys: Object.keys(payload || {}).slice(0, 20),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge") || "";
      const settings = await getSettings();

      if (mode === "subscribe" && token && token === settings.verifyToken) {
        return textResponse(challenge);
      }

      return textResponse("Forbidden", 403);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Método não permitido." }, 405);
    }

    const settings = await getSettings();
    const payload = await request.json().catch(() => ({}));
    const statuses = extractStatuses(payload);
    const messages = extractMessages(payload);
    await Promise.all([
      upsertSetting(WEBHOOK_LAST_POST_AT_KEY, new Date().toISOString()),
      upsertSetting(WEBHOOK_LAST_POST_SUMMARY_KEY, buildWebhookPayloadSummary(payload, messages, statuses)),
      deleteSetting(WEBHOOK_LAST_ERROR_AT_KEY),
      deleteSetting(WEBHOOK_LAST_ERROR_KEY),
    ]);
    await insertStatusAuditRows(statuses);
    await insertMessageAuditRows(buildMessageAuditRows(messages));

    await Promise.all(
      messages.map(async (message: any) => {
        const from = normalizePhoneNumber(String(message?.from || ""));
        await markUserSessionActive(from);

        if (!isAuthorizedAdminNumber(from, settings.adminNumbers)) {
          return;
        }

        try {
          await markAdminSessionActive(from);

          if (
            (message.type === "interactive" || message.type === "button") &&
            matchesAdminKeepaliveButton(message)
          ) {
            await handleAdminKeepalive(from);
            return;
          }

          if (message.type === "image" && message.image?.id) {
            await handleImageMessage(from, message.image.id);
            return;
          }

          if (message.type === "text" && typeof message.text?.body === "string") {
            await handleTextMessage(from, message.text.body);
            return;
          }

          if (
            message.type === "interactive" &&
            (message.interactive?.button_reply?.id === CONFIRM_BUTTON_ID ||
              String(message.interactive?.button_reply?.title || "").trim().toLowerCase() ===
                "confirmar")
          ) {
            await handleConfirmation(from);
            return;
          }

          if (
            message.type === "button" &&
            (message.button?.payload === CONFIRM_BUTTON_ID ||
              String(message.button?.text || message.button?.payload || "").trim().toLowerCase() ===
                "confirmar")
          ) {
            await handleConfirmation(from);
            return;
          }

          return;
        } catch (error) {
          console.error(error);
        }
      }),
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    await Promise.allSettled([
      upsertSetting(WEBHOOK_LAST_ERROR_AT_KEY, new Date().toISOString()),
      upsertSetting(
        WEBHOOK_LAST_ERROR_KEY,
        error instanceof Error ? error.message : "Erro desconhecido no webhook do WhatsApp.",
      ),
    ]);
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp.",
      },
      400,
    );
  }
});
