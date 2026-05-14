const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GRAPH_API_VERSION = "v25.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppSetting = {
  key: string;
  value: string;
};

type SupabaseUser = {
  id: string;
  email?: string;
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

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("WhatsApp invalido.");
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

function userSessionKeys(phone: string) {
  return getBrazilianPhoneVariants(phone).map((variant) => `WHATSAPP_USER_SESSION_${variant}`);
}

function senderIdFilter(phone: string) {
  return getBrazilianPhoneVariants(phone)
    .filter(Boolean)
    .map((variant) => `sender_id.eq.${variant}`)
    .join(",");
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
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

async function requireAdmin(user: SupabaseUser) {
  const rows = (await supabaseFetch(
    `usuarios?select=id,is_admin,role,email,auth_user_id&auth_user_id=eq.${encodeURIComponent(
      user.id,
    )}&limit=1`,
  )) as Array<{
    is_admin: boolean | null;
    role: string | null;
    email: string | null;
    auth_user_id: string | null;
  }>;

  const profile = rows[0];
  if (profile?.is_admin || profile?.role === "admin") return;

  const email = user.email?.trim().toLowerCase();
  if (email) {
    const byEmail = (await supabaseFetch(
      `usuarios?select=id,is_admin,role&email=ilike.${encodeURIComponent(email)}&limit=1`,
    )) as Array<{ is_admin: boolean | null; role: string | null }>;

    if (byEmail[0]?.is_admin || byEmail[0]?.role === "admin") return;
  }

  throw new Error("Apenas administradores podem responder conversas.");
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
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const filter = senderIdFilter(phone);
  if (!filter) return false;

  const rows = (await supabaseFetch(
    `whatsapp_webhook_message_audit?select=message_id,occurred_at,created_at&or=(${filter})&order=occurred_at.desc&limit=20`,
    {
      headers: { Prefer: "return=representation" },
    },
  )) as Array<{ occurred_at: string | null; created_at: string | null }>;

  return rows.some((row) => {
    const timestamp = row.occurred_at || row.created_at;
    if (!timestamp) return false;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) && parsed >= Date.parse(threshold);
  });
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

  return payload as {
    contacts?: Array<{ wa_id?: string }>;
    messages?: Array<{ id?: string }>;
  };
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

    const user = await getAuthenticatedUser(request);
    await requireAdmin(user);

    const body = await request.json().catch(() => ({}));
    const to = typeof body.to === "string" ? normalizeWhatsAppPhoneNumber(body.to) : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!to) throw new Error("Numero do destinatario nao informado.");
    if (!text) throw new Error("Digite uma mensagem para enviar.");
    if (!(await hasActiveUserSession(to)) && !(await hasRecentInboundMessage(to))) {
      throw new Error(
        "A janela de 24 horas do usuario esta fechada. Aguarde uma nova mensagem dele para responder por aqui.",
      );
    }

    const payload = await sendTextMessage({ to, text });
    const messageId = payload.messages?.[0]?.id?.trim();
    if (!messageId) {
      throw new Error("WhatsApp enviado, mas a resposta nao retornou o id da mensagem.");
    }

    await supabaseFetch("whatsapp_outbound_message_audit", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        message_id: messageId,
        recipient_id: to,
        message_type: "text",
        body: text,
        occurred_at: new Date().toISOString(),
        raw_payload: payload,
      }),
    });

    return jsonResponse({
      ok: true,
      messageId,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao responder conversa.",
      },
      400,
    );
  }
});
