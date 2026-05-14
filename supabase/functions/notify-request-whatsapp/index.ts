const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GRAPH_API_VERSION = "v25.0";
const USER_SESSION_DURATION_HOURS = 24;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationType =
  | "requestCreated"
  | "requestSigned"
  | "outputAttached"
  | "readyForPickup";

type AppSetting = {
  key: string;
  value: string;
};

type SupabaseUser = {
  id: string;
};

type RequestCodeSource = {
  id: string;
  saida_codigo: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("WhatsApp do usuario invalido.");
  }

  return digits;
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

  return [...variants];
}

function phonesMatch(left: string, right: string) {
  const leftVariants = getBrazilianPhoneVariants(left);
  const rightVariants = getBrazilianPhoneVariants(right);
  return leftVariants.some((value) => rightVariants.includes(value));
}

function senderIdFilter(phone: string) {
  return getBrazilianPhoneVariants(phone)
    .filter(Boolean)
    .map((variant) => `sender_id.eq.${variant}`)
    .join(",");
}

function userSessionKeys(phone: string) {
  return getBrazilianPhoneVariants(phone).map((variant) => `WHATSAPP_USER_SESSION_${variant}`);
}

function adminSessionKeys(phone: string) {
  return getBrazilianPhoneVariants(phone).map((variant) => `WHATSAPP_ADMIN_SESSION_${variant}`);
}

function getNotificationType(value: unknown): NotificationType {
  if (
    value === "requestCreated" ||
    value === "outputAttached" ||
    value === "readyForPickup" ||
    value === "requestSigned"
  ) {
    return value;
  }

  throw new Error("Tipo de notificacao invalido.");
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? `Erro ${response.status} ao consultar Supabase.`);
  }

  return payload;
}

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Sessao expirada. Entre novamente.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
    },
  });

  const user = (await response.json().catch(() => null)) as SupabaseUser | null;
  if (!response.ok || !user?.id) {
    throw new Error("Sessao invalida. Entre novamente.");
  }

  return user;
}

async function getWhatsAppSettings() {
  const envAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const envPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const envGraphApiVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim();

  const rows = (await supabaseFetch(
    "app_settings?select=key,value&key=in.(WHATSAPP_ACCESS_TOKEN,WHATSAPP_PHONE_NUMBER_ID,WHATSAPP_GRAPH_API_VERSION)",
  )) as AppSetting[];

  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const accessToken = settings.get("WHATSAPP_ACCESS_TOKEN")?.trim() || envAccessToken;
  const phoneNumberId = settings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() || envPhoneNumberId;
  const graphApiVersion =
    settings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    envGraphApiVersion ||
    DEFAULT_GRAPH_API_VERSION;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp nao configurado.");
  }

  return { accessToken, phoneNumberId, graphApiVersion };
}

async function getSetting(key: string) {
  const rows = (await supabaseFetch(
    `app_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`,
  )) as Array<{ value: string }>;

  return rows[0]?.value || "";
}

function parseAdminNumbers(value: string) {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function hasActiveUserSession(phone: string) {
  for (const key of userSessionKeys(phone)) {
    const rawValue = await getSetting(key);
    if (!rawValue) continue;

    const expiresAt = Date.parse(rawValue);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return true;
    }
  }

  return false;
}

async function hasRecentInboundMessage(phone: string) {
  const threshold = Date.now() - USER_SESSION_DURATION_HOURS * 60 * 60 * 1000;
  const filter = senderIdFilter(phone);
  if (!filter) return false;

  const rows = (await supabaseFetch(
    `whatsapp_webhook_message_audit?select=message_id,occurred_at,created_at&or=(${filter})&order=occurred_at.desc&limit=20`,
  )) as Array<{ occurred_at: string | null; created_at: string | null }>;

  return rows.some((row) => {
    const timestamp = row.occurred_at || row.created_at;
    if (!timestamp) return false;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) && parsed > threshold;
  });
}

async function hasActiveAdminSession(phone: string) {
  for (const key of adminSessionKeys(phone)) {
    const rawValue = await getSetting(key);
    if (!rawValue) continue;

    const expiresAt = Date.parse(rawValue);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return true;
    }
  }

  return false;
}

async function resolveRequestCode(requisicao: RequestCodeSource) {
  if (requisicao.saida_codigo?.trim()) return requisicao.saida_codigo.trim();
  return requisicao.id;
}

function resolveRequestDate(value: string | null, fallback: string | null) {
  const raw = (value?.trim() || fallback?.trim() || "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(parsed);
}

async function getRequestNotificationData(requestId: string) {
  const requests = (await supabaseFetch(
    `requisicoes?select=id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf,setor,status&id=eq.${encodeURIComponent(
      requestId,
    )}&limit=1`,
  )) as Array<{
    id: string;
    saida_codigo: string | null;
    categoria: string | null;
    data: string | null;
    created_at: string | null;
    solicitante: string | null;
    solicitante_cpf: string | null;
    setor: string | null;
    status: string | null;
  }>;

  const requisicao = requests[0];
  if (!requisicao) throw new Error("Requisicao nao encontrada.");
  const requestCode = await resolveRequestCode(requisicao);

  let user:
    | {
        nome: string | null;
        whatsapp: string | null;
        is_admin: boolean | null;
      }
    | undefined;

  if (requisicao.solicitante_cpf) {
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp,is_admin&cpf=eq.${encodeURIComponent(
        requisicao.solicitante_cpf,
      )}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null; is_admin: boolean | null }>;
    user = users[0];
  }

  if (!user && requisicao.solicitante) {
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp,is_admin&nome=eq.${encodeURIComponent(requisicao.solicitante)}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null; is_admin: boolean | null }>;
    user = users[0];
  }

  return {
    whatsapp: user?.whatsapp?.trim() || "",
    requesterIsAdmin: Boolean(user?.is_admin),
    requestCode,
    materialType: requisicao.categoria,
    requesterName: user?.nome || requisicao.solicitante,
    locationName: requisicao.setor,
    status: requisicao.status,
    requestDate: resolveRequestDate(requisicao.data, requisicao.created_at),
  };
}

async function sendTextMessage(input: { to: string; text: string }) {
  const config = await getWhatsAppSettings();
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
        to: normalizeWhatsAppPhoneNumber(input.to),
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
    const error = payload?.error;
    throw new Error(
      [
        error?.message || `Erro ${response.status} ao enviar WhatsApp.`,
        error?.code ? `code=${error.code}` : "",
        error?.error_subcode ? `subcode=${error.error_subcode}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return payload?.messages?.[0]?.id as string | undefined;
}

async function logOutboundMessage(input: {
  messageId: string;
  to: string;
  text: string;
  occurredAt?: string;
  rawPayload?: unknown;
}) {
  await supabaseFetch("whatsapp_outbound_message_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      message_id: input.messageId,
      recipient_id: normalizeWhatsAppPhoneNumber(input.to),
      message_type: "text",
      body: input.text,
      occurred_at: input.occurredAt || new Date().toISOString(),
      raw_payload: input.rawPayload ?? {},
    }),
  });
}

function buildUserNotificationMessage(input: {
  notificationType: NotificationType;
  requestCode: string;
  materialType: string | null;
  requesterName: string | null | undefined;
  locationName: string | null;
  requestDate?: string | null;
  status?: string | null;
}) {
  if (input.notificationType === "requestCreated") {
    return [
      "📝 Requisição criada com sucesso!",
      "",
      `Olá, ${valueOrDash(input.requesterName)}.`,
      `Número: ${valueOrDash(input.requestCode)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "Falta apenas sua assinatura para enviar a requisição ao almoxarifado.",
    ].join("\n");
  }

  if (input.notificationType === "requestSigned") {
    return [
      "✅ Requisição assinada com sucesso!",
      "",
      `Olá, ${valueOrDash(input.requesterName)}.`,
      `Número: ${valueOrDash(input.requestCode)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "Seu pedido foi enviado ao almoxarifado.",
    ].join("\n");
  }

  if (input.notificationType === "outputAttached") {
    return [
      "📎 Saída anexada pelo almoxarifado!",
      "",
      `Olá, ${valueOrDash(input.requesterName)}.`,
      `Número: ${valueOrDash(input.requestCode)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "A saída foi gerada e agora está aguardando sua assinatura.",
    ].join("\n");
  }

  if (input.notificationType === "readyForPickup") {
    return [
      "📦 Pedido pronto para retirada!",
      "",
      `Olá, ${valueOrDash(input.requesterName)}.`,
      `Número: ${valueOrDash(input.requestCode)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "Seu pedido já pode ser retirado.",
    ].join("\n");
  }

  if (input.status === "concluido") {
    return [
      "🎉 Seu pedido foi concluído com sucesso!",
      "",
      `Olá, ${valueOrDash(input.requesterName)}.`,
      `Número: ${valueOrDash(input.requestCode)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "A assinatura e a conclusão do pedido foram registradas com sucesso.",
    ].join("\n");
  }

  return [
    `Olá, ${valueOrDash(input.requesterName)}.`,
    `A requisição número ${valueOrDash(input.requestCode)} foi enviada para o almoxarifado.`,
  ].join("\n");
}

function buildAdminNotificationMessage(input: {
  notificationType: NotificationType;
  requestCode: string;
  materialType: string | null;
  requesterName: string | null | undefined;
  locationName: string | null;
  requestDate?: string | null;
  status?: string | null;
}) {
  if (input.notificationType === "requestCreated") {
    return [
      "🆕 Nova requisição gerada",
      "",
      `Número: ${valueOrDash(input.requestCode)}`,
      `Solicitante: ${valueOrDash(input.requesterName)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
    ].join("\n");
  }

  if (input.notificationType === "requestSigned") {
    const title =
      input.status === "concluido"
        ? "✅ Saída assinada pelo usuário"
        : "✅ Requisição assinada pelo usuário";

    return [
      title,
      "",
      `Número: ${valueOrDash(input.requestCode)}`,
      `Solicitante: ${valueOrDash(input.requesterName)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
    ].join("\n");
  }

  if (input.notificationType === "outputAttached") {
    return [
      "📎 Saída anexada pelo almoxarifado",
      "",
      `Número: ${valueOrDash(input.requestCode)}`,
      `Solicitante: ${valueOrDash(input.requesterName)}`,
      `Local: ${valueOrDash(input.locationName)}`,
      `Tipo de material: ${valueOrDash(input.materialType)}`,
      `Data: ${valueOrDash(input.requestDate)}`,
      "",
      "Aguardando assinatura da saída.",
    ].join("\n");
  }

  return [
    "📦 Pedido pronto para retirada",
    "",
    `Número: ${valueOrDash(input.requestCode)}`,
    `Solicitante: ${valueOrDash(input.requesterName)}`,
    `Local: ${valueOrDash(input.locationName)}`,
    `Tipo de material: ${valueOrDash(input.materialType)}`,
    `Data: ${valueOrDash(input.requestDate)}`,
  ].join("\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Metodo nao permitido." }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase nao configurado.");
    }

    await getAuthenticatedUser(request);

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!requestId) throw new Error("Requisicao nao informada.");

    const notificationType = getNotificationType(body.notificationType);
    const notificationData = await getRequestNotificationData(requestId);
    const adminNumbers = parseAdminNumbers(await getSetting("WHATSAPP_ADMIN_NUMBERS"));

    let skipped = false;
    let reason = "";
    let messageId: string | undefined;
    const adminNotifications: Array<{
      to: string;
      ok: boolean;
      messageId?: string;
      skipped?: boolean;
      error?: string;
    }> = [];

    const requesterIsAdminNumber =
      Boolean(notificationData.whatsapp) &&
      adminNumbers.some((adminNumber) => phonesMatch(adminNumber, notificationData.whatsapp));

    if (!notificationData.whatsapp) {
      skipped = true;
      reason = "Usuario sem WhatsApp cadastrado.";
    } else if (notificationData.requesterIsAdmin || requesterIsAdminNumber) {
      skipped = true;
      reason = "Destinatario principal e admin; mensagem de usuario nao enviada.";
    } else {
      const text = buildUserNotificationMessage({
        notificationType,
        requestCode: notificationData.requestCode,
        materialType: notificationData.materialType,
        requesterName: notificationData.requesterName,
        locationName: notificationData.locationName,
        requestDate: notificationData.requestDate,
        status: notificationData.status,
      });

      messageId = await sendTextMessage({
        to: notificationData.whatsapp,
        text,
      });

      if (messageId) {
        await logOutboundMessage({
          messageId,
          to: notificationData.whatsapp,
          text,
          rawPayload: {
            source: "notify-request-whatsapp",
            audience: "user",
            notificationType,
          },
        });
      }
    }

    if (
      notificationType === "requestCreated" ||
      notificationType === "requestSigned" ||
      notificationType === "outputAttached"
    ) {
      const adminText = buildAdminNotificationMessage({
        notificationType,
        requestCode: notificationData.requestCode,
        materialType: notificationData.materialType,
        requesterName: notificationData.requesterName,
        locationName: notificationData.locationName,
        requestDate: notificationData.requestDate,
        status: notificationData.status,
      });

      for (const adminNumber of adminNumbers) {
        try {
          if (!(await hasActiveAdminSession(adminNumber))) {
            adminNotifications.push({
              to: normalizeWhatsAppPhoneNumber(adminNumber),
              ok: false,
              skipped: true,
              error:
                `Janela de ${USER_SESSION_DURATION_HOURS} horas do admin esta fechada. ` +
                "Peca para ele enviar uma mensagem ao WhatsApp oficial.",
            });
            continue;
          }

          const adminMessageId = await sendTextMessage({
            to: adminNumber,
            text: adminText,
          });

          if (!adminMessageId) {
            adminNotifications.push({
              to: normalizeWhatsAppPhoneNumber(adminNumber),
              ok: false,
              error: "WhatsApp enviado sem retorno do id da mensagem.",
            });
            continue;
          }

          await logOutboundMessage({
            messageId: adminMessageId,
            to: adminNumber,
            text: adminText,
            rawPayload: {
              source: "notify-request-whatsapp",
              audience: "admin",
              notificationType,
            },
          });

          adminNotifications.push({
            to: normalizeWhatsAppPhoneNumber(adminNumber),
            ok: true,
            messageId: adminMessageId,
          });
        } catch (adminError) {
          adminNotifications.push({
            to: normalizeWhatsAppPhoneNumber(adminNumber),
            ok: false,
            error: adminError instanceof Error ? adminError.message : "Erro ao enviar aviso ao admin.",
          });
        }
      }
    }

    return jsonResponse({
      ok: true,
      skipped,
      reason,
      messageId,
      requesterName: valueOrDash(notificationData.requesterName),
      adminNotifications,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao enviar WhatsApp.",
      },
      400,
    );
  }
});
