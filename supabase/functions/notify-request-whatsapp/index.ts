const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GRAPH_API_VERSION = "v25.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WHATSAPP_TEMPLATE_LANGUAGE = "pt_BR";
const WHATSAPP_TEMPLATE_NAMES = {
  requestCreated: "pedido_gerado_assinatura",
  outputAttached: "saida_anexada_pedido",
  readyForPickup: "pedido_pronto_retirada",
} as const;

type NotificationType = keyof typeof WHATSAPP_TEMPLATE_NAMES;

type AppSetting = {
  key: string;
  value: string;
};

type SupabaseUser = {
  id: string;
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
  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("WhatsApp do usuario invalido.");
  }

  return digits;
}

function getNotificationType(value: unknown): NotificationType {
  if (
    value === "requestCreated" ||
    value === "outputAttached" ||
    value === "readyForPickup"
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

async function getRequestNotificationData(requestId: string) {
  const requests = (await supabaseFetch(
    `requisicoes?select=id,saida_codigo,categoria,data,solicitante,solicitante_cpf&id=eq.${encodeURIComponent(
      requestId,
    )}&limit=1`,
  )) as Array<{
    id: string;
    saida_codigo: string | null;
    categoria: string | null;
    data: string | null;
    solicitante: string | null;
    solicitante_cpf: string | null;
  }>;

  const requisicao = requests[0];
  if (!requisicao) throw new Error("Requisicao nao encontrada.");

  let user:
    | {
        nome: string | null;
        whatsapp: string | null;
      }
    | undefined;

  if (requisicao.solicitante_cpf) {
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp&cpf=eq.${encodeURIComponent(
        requisicao.solicitante_cpf,
      )}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null }>;
    user = users[0];
  }

  if (!user && requisicao.solicitante) {
    const users = (await supabaseFetch(
      `usuarios?select=nome,whatsapp&nome=eq.${encodeURIComponent(requisicao.solicitante)}&limit=1`,
    )) as Array<{ nome: string | null; whatsapp: string | null }>;
    user = users[0];
  }

  return {
    whatsapp: user?.whatsapp?.trim() || "",
    requestCode: requisicao.saida_codigo || requisicao.id,
    materialType: requisicao.categoria,
    requestDate: requisicao.data,
    requesterName: user?.nome || requisicao.solicitante,
  };
}

async function sendRequestTemplate(input: {
  to: string;
  templateName: string;
  requestCode: string;
  materialType: string | null;
  requestDate: string | null;
}) {
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
        type: "template",
        template: {
          name: input.templateName,
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: valueOrDash(input.requestCode) },
                { type: "text", text: valueOrDash(input.materialType) },
                { type: "text", text: valueOrDash(input.requestDate) },
              ],
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
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase nao configurado.");
    }

    await getAuthenticatedUser(request);

    const body = await request.json().catch(() => ({}));
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    if (!requestId) throw new Error("Requisicao nao informada.");

    const notificationType = getNotificationType(body.notificationType);
    const notificationData = await getRequestNotificationData(requestId);

    if (!notificationData.whatsapp) {
      return jsonResponse({
        ok: true,
        skipped: true,
        reason: "Usuario sem WhatsApp cadastrado.",
      });
    }

    const messageId = await sendRequestTemplate({
      to: notificationData.whatsapp,
      templateName: WHATSAPP_TEMPLATE_NAMES[notificationType],
      requestCode: notificationData.requestCode,
      materialType: notificationData.materialType,
      requestDate: notificationData.requestDate,
    });

    return jsonResponse({
      ok: true,
      skipped: false,
      messageId,
      requesterName: valueOrDash(notificationData.requesterName),
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
