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

  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  if (!digits.startsWith("55") || digits.length < 12) {
    throw new Error("Telefone do WhatsApp invalido. Informe DDI + DDD + numero.");
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

async function sendWelcomeText(input: { to: string; requesterName: string }) {
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
        to: input.to,
        type: "text",
        text: {
          preview_url: false,
          body:
            `Ola, ${input.requesterName || "usuario"}.\n` +
            "Seu WhatsApp foi cadastrado com sucesso no sistema do almoxarifado.",
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

    const user = await getAuthenticatedUser(request);
    const body = await request.json().catch(() => ({}));
    const profileId = typeof body.profileId === "string" ? body.profileId : "";
    const whatsappInput = typeof body.whatsapp === "string" ? body.whatsapp : "";

    if (!profileId) throw new Error("Perfil do usuario nao informado.");
    if (!whatsappInput) throw new Error("Informe o numero do WhatsApp.");

    const whatsapp = normalizeWhatsAppPhoneNumber(whatsappInput);

    const rows = (await supabaseFetch(
      `usuarios?select=id,nome,email,auth_user_id,whatsapp&id=eq.${encodeURIComponent(profileId)}&limit=1`,
    )) as Array<{
      id: string;
      nome: string | null;
      email: string | null;
      auth_user_id: string | null;
      whatsapp: string | null;
    }>;

    const profile = rows[0];
    if (!profile) throw new Error("Perfil do usuario nao encontrado.");

    const profileEmail = profile.email?.trim().toLowerCase() || "";
    const currentUserEmail = user.email?.trim().toLowerCase() || "";
    const belongsToCurrentUser =
      profile.auth_user_id === user.id || (!profile.auth_user_id && profileEmail === currentUserEmail);

    if (!belongsToCurrentUser) {
      throw new Error("Voce nao tem permissao para alterar este perfil.");
    }

    const updated = (await supabaseFetch(
      `usuarios?id=eq.${encodeURIComponent(profileId)}&select=whatsapp`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ auth_user_id: user.id, whatsapp }),
      },
    )) as Array<{ whatsapp: string | null }>;

    if (!updated[0]?.whatsapp) {
      throw new Error("Nao foi possivel salvar o WhatsApp do usuario.");
    }

    let messageId: string | undefined;
    let welcomeError: string | undefined;

    try {
      if (await hasActiveUserSession(whatsapp)) {
        messageId = await sendWelcomeText({
          to: whatsapp,
          requesterName: profile.nome || currentUserEmail || "usuario",
        });
      } else {
        welcomeError =
          `WhatsApp salvo, mas a janela de ${USER_SESSION_DURATION_HOURS} horas esta fechada. ` +
          "Peca para o usuario enviar uma mensagem ao WhatsApp oficial e tente novamente.";
      }
    } catch (error) {
      welcomeError =
        error instanceof Error
          ? error.message
          : "WhatsApp salvo, mas nao foi possivel enviar a mensagem de boas-vindas.";
    }

    return jsonResponse({
      ok: true,
      whatsapp: updated[0].whatsapp,
      messageId,
      welcomeError,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao salvar WhatsApp.",
      },
      400,
    );
  }
});
