const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GRAPH_API_VERSION = "v25.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WHATSAPP_TEMPLATE_LANGUAGE = "pt_BR";
const WELCOME_TEMPLATE_NAME = "boas_vindas_almoxarifado";

type AppSetting = {
  key: string;
  value: string;
};

type AuditLogInput = {
  runId: string;
  targetNumber: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  triggeredAt: string;
  requestPayload: unknown;
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

function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;

  throw new Error(`WhatsApp invalido: ${value}`);
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
    .map(normalizeWhatsAppPhoneNumber)
    .filter((number, index, numbers) => number && numbers.indexOf(number) === index);
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

async function getWhatsAppSettings() {
  const envAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const envPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const envGraphApiVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim();

  const rows = (await supabaseFetch(
    "app_settings?select=key,value&key=in.(WHATSAPP_ACCESS_TOKEN,WHATSAPP_PHONE_NUMBER_ID,WHATSAPP_GRAPH_API_VERSION,WHATSAPP_ADMIN_NUMBERS)",
  )) as AppSetting[];

  const settings = new Map(rows.map((row) => [row.key, row.value]));
  const accessToken = settings.get("WHATSAPP_ACCESS_TOKEN")?.trim() || envAccessToken;
  const phoneNumberId = settings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() || envPhoneNumberId;
  const graphApiVersion =
    settings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    envGraphApiVersion ||
    DEFAULT_GRAPH_API_VERSION;
  const adminNumbers = parseAdminNumbers(settings.get("WHATSAPP_ADMIN_NUMBERS") || "");

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp nao configurado.");
  }

  return { accessToken, phoneNumberId, graphApiVersion, adminNumbers };
}

async function insertAuditLogs(entries: AuditLogInput[]) {
  if (!entries.length) return;

  await supabaseFetch("whatsapp_admin_welcome_audit", {
    method: "POST",
    headers: {
      Prefer: "return=minimal",
    },
    body: JSON.stringify(
      entries.map((entry) => ({
        run_id: entry.runId,
        target_number: entry.targetNumber,
        ok: entry.ok,
        message_id: entry.messageId ?? null,
        error: entry.error ?? null,
        triggered_at: entry.triggeredAt,
        request_payload: entry.requestPayload ?? null,
      })),
    ),
  });
}

function isAuthorized(request: Request) {
  const cronSecret = Deno.env.get("CRON_SECRET")?.trim();
  if (cronSecret) return request.headers.get("x-cron-secret") === cronSecret;

  const authHeader = request.headers.get("authorization") || "";
  return Boolean(SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
}

async function sendWelcomeTemplate(input: {
  to: string;
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}) {
  const response = await fetch(
    `https://graph.facebook.com/${input.graphApiVersion}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppPhoneNumber(input.to),
        type: "template",
        template: {
          name: WELCOME_TEMPLATE_NAME,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: "Administrador" }],
            },
          ],
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Metodo nao permitido." }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase nao configurado.");
    }

    if (!isAuthorized(request)) {
      return jsonResponse({ ok: false, error: "Nao autorizado." }, 401);
    }

    const requestPayload = await request.json().catch(() => ({}));
    const config = await getWhatsAppSettings();
    const runId = crypto.randomUUID();
    const triggeredAt = new Date().toISOString();
    const results = await Promise.allSettled(
      config.adminNumbers.map((number) =>
        sendWelcomeTemplate({
          to: number,
          accessToken: config.accessToken,
          phoneNumberId: config.phoneNumberId,
          graphApiVersion: config.graphApiVersion,
        }),
      ),
    );

    const notifications = results.map((result, index) => ({
      to: config.adminNumbers[index],
      ok: result.status === "fulfilled",
      messageId: result.status === "fulfilled" ? result.value : undefined,
      error: result.status === "rejected" ? String(result.reason?.message || result.reason) : undefined,
    }));

    await insertAuditLogs(
      notifications.map((notification) => ({
        runId,
        targetNumber: notification.to,
        ok: notification.ok,
        messageId: notification.messageId,
        error: notification.error,
        triggeredAt,
        requestPayload,
      })),
    );

    return jsonResponse({
      ok: true,
      runId,
      sentAt: triggeredAt,
      notifications,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao enviar boas-vindas.",
      },
      400,
    );
  }
});
