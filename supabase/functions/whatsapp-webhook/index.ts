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

function parseRequestDate(value?: string | null) {
  const raw = String(value || "").trim();
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatRequestCodeDate(value?: string | null) {
  const date = parseRequestDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${day}${month}${year}`;
}

function buildRequestCodes(requests: RequestCodeSource[]) {
  const sorted = [...requests].sort((left, right) => {
    const leftTime = new Date(left.created_at || left.data || "").getTime();
    const rightTime = new Date(right.created_at || right.data || "").getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });

  return new Map(
    sorted.map((request, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      return [
        request.id,
        request.saida_codigo ||
          `${formatRequestCodeDate(request.data || request.created_at)}${sequence}`,
      ];
    }),
  );
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
}

async function sendConfirmationButtonMessage(input: {
  to: string;
  pending: PendingConfirmation;
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
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: buildConfirmationMessage(input.pending),
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: CONFIRM_BUTTON_ID,
                  title: "Confirmar",
                },
              },
            ],
          },
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Erro ao enviar botão de confirmação.");
  }
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
  return value
    .trim()
    .replace(/^c[oó]digo\s*[:#-]?\s*/i, "")
    .replace(/^cod\s*[:#-]?\s*/i, "")
    .trim();
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
    const requests = (await supabaseFetch(
      "requisicoes?select=id,saida_codigo,data,created_at&order=created_at.asc",
    )) as RequestCodeSource[];
    const matchingRequestId = [...buildRequestCodes(requests).entries()].find(
      ([, requestCode]) => requestCode === code,
    )?.[0];

    if (matchingRequestId) {
      const rowsByGeneratedCode = (await supabaseFetch(
        `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,status,signed_attachment,admin_attachment&id=eq.${encodeURIComponent(
          matchingRequestId,
        )}&limit=1`,
      )) as RequisicaoRow[];
      requisicao = rowsByGeneratedCode[0];

      if (requisicao && !requisicao.saida_codigo?.trim()) {
        await supabaseFetch(`requisicoes?id=eq.${encodeURIComponent(requisicao.id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ saida_codigo: code }),
        });
        requisicao = { ...requisicao, saida_codigo: code };
      }
    }
  }

  if (!requisicao) {
    throw new Error("Código não encontrado. Confira o COD abaixo do QR Code e envie novamente.");
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

function buildConfirmationMessage(pending: PendingConfirmation) {
  return [
    "Pedido encontrado. Confira antes de confirmar:",
    "",
    `Usuário: ${pending.request.requester}`,
    `CPF: ${pending.request.requesterCpf}`,
    `Tipo: ${pending.request.materialType}`,
    `Número: ${pending.request.requestCode}`,
    `Data: ${pending.request.requestDate}`,
  ].join("\n");
}

async function savePendingAndAskConfirmation(from: string, pending: PendingConfirmation) {
  await upsertPendingConfirmation(from, pending);
  await sendConfirmationButtonMessage({ to: from, pending });
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
    const { requisicao, request } = await getRequestByManualCode(text);
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
    await sendTextMessage({
      to: from,
      text: "Nenhum pedido aguardando confirmação. Envie a foto do QR Code ou digite o COD abaixo do QR.",
    });
    return;
  }

  const pending = JSON.parse(pendingRaw) as PendingConfirmation;
  const ageMs = Date.now() - Date.parse(pending.createdAt);
  if (!Number.isFinite(ageMs) || ageMs > 24 * 60 * 60 * 1000) {
    await deletePendingConfirmation(from);
    await sendTextMessage({
      to: from,
      text: "Confirmação expirada. Envie a foto do QR Code ou digite o COD novamente.",
    });
    return;
  }

  const result = await confirmPending(pending);
  await deletePendingConfirmation(from);

  await sendTextMessage({
    to: from,
    text: result.notificationSkippedReason
      ? `Pedido ${result.request.requestCode} confirmado. ${result.notificationSkippedReason}`
      : `Pedido ${result.request.requestCode} confirmado. Responsável avisado no WhatsApp.`,
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
    const messages = extractMessages(payload);

    await Promise.all(
      messages.map(async (message: any) => {
        const from = normalizePhoneNumber(String(message?.from || ""));
        if (!isAuthorizedAdminNumber(from, settings.adminNumbers)) {
          return;
        }

        try {
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

          await sendTextMessage({
            to: from,
            text: "Envie uma foto do QR Code ou digite o COD abaixo do QR.",
          });
        } catch (error) {
          await sendTextMessage({
            to: from,
            text:
              error instanceof Error
                ? `${error.message}\n\nSe a foto não ler, digite o COD que aparece abaixo do QR Code.`
                : "Não foi possível processar. Se a foto não ler, digite o COD abaixo do QR Code.",
          });
        }
      }),
    );

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro no webhook do WhatsApp.",
      },
      400,
    );
  }
});
