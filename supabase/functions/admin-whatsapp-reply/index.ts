const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GRAPH_API_VERSION = "v25.0";
const ADMIN_OUTSIDE_WINDOW_TEMPLATE_NAME = "mensagem_admin_almoxarifado";
const ADMIN_OUTSIDE_WINDOW_TEMPLATE_PREVIEW = "Oi";

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

type OutboundAudioInput = {
  fileName: string;
  mimeType: string;
  base64: string;
};

type AdminProfile = {
  id: string;
  nome: string | null;
  email: string | null;
  is_admin: boolean | null;
  role: string | null;
  auth_user_id: string | null;
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
    throw new Error("WhatsApp invalido.");
  }

  return digits;
}

function getFileExtensionFromMimeType(value: string | null | undefined) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (!mimeType) return "bin";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mp4")) return "mp4";

  const extension = mimeType.split("/")[1]?.split(";")[0]?.trim();
  return extension || "bin";
}

function decodeBase64(base64: string) {
  const normalized = base64.trim();
  if (!normalized) throw new Error("Audio invalido.");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    `usuarios?select=id,nome,is_admin,role,email,auth_user_id&auth_user_id=eq.${encodeURIComponent(
      user.id,
    )}&limit=1`,
  )) as AdminProfile[];

  const profile = rows[0];
  if (profile?.is_admin || profile?.role === "admin") return profile;

  const email = user.email?.trim().toLowerCase();
  if (email) {
    const byEmail = (await supabaseFetch(
      `usuarios?select=id,nome,is_admin,role,email,auth_user_id&email=ilike.${encodeURIComponent(email)}&limit=1`,
    )) as AdminProfile[];

    if (byEmail[0]?.is_admin || byEmail[0]?.role === "admin") return byEmail[0];
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

async function uploadToStorage(bucket: string, storagePath: string, bytes: Uint8Array, contentType: string) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "Erro ao salvar audio no Storage.");
  }
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

async function sendTemplateMessage(input: {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParameters?: Array<string | number | null | undefined>;
}) {
  const config = await getWhatsAppSettings();
  const parameters = (input.bodyParameters || []).map((value) => ({
    type: "text",
    text: String(value ?? "-"),
  }));
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
          language: {
            code: input.languageCode || "pt_BR",
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
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(
      [
        error?.message || `Erro ${response.status} ao enviar template WhatsApp.`,
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

async function uploadWhatsAppMedia(input: { bytes: Uint8Array; fileName: string; mimeType: string }) {
  const config = await getWhatsAppSettings();
  const formData = new FormData();
  const blob = new Blob([input.bytes], { type: input.mimeType });
  formData.append("messaging_product", "whatsapp");
  formData.append("type", input.mimeType);
  formData.append("file", blob, input.fileName);

  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: formData,
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id) {
    const error = payload?.error;
    throw new Error(
      [
        error?.message || `Erro ${response.status} ao enviar media para WhatsApp.`,
        error?.code ? `code=${error.code}` : "",
        error?.error_subcode ? `subcode=${error.error_subcode}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return String(payload.id);
}

async function sendAudioMessage(input: { to: string; audioMediaId: string }) {
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
        type: "audio",
        audio: {
          id: input.audioMediaId,
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new Error(
      [
        error?.message || `Erro ${response.status} ao enviar audio no WhatsApp.`,
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

function getAdminDisplayName(profile: AdminProfile, user: SupabaseUser) {
  return profile.nome?.trim() || profile.email?.trim() || user.email?.trim() || "Admin";
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
    const adminProfile = await requireAdmin(user);

    const body = await request.json().catch(() => ({}));
    const to = typeof body.to === "string" ? normalizeWhatsAppPhoneNumber(body.to) : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
    const audio =
      body.audio && typeof body.audio === "object"
        ? (body.audio as Partial<OutboundAudioInput>)
        : null;
    const sendTemplateOnly = mode === "template";

    if (!to) throw new Error("Numero do destinatario nao informado.");
    if (!sendTemplateOnly && !text && !audio) throw new Error("Digite uma mensagem ou envie um audio.");

    const canSendFreeform =
      sendTemplateOnly || (await hasActiveUserSession(to)) || (await hasRecentInboundMessage(to));
    if (!canSendFreeform) {
      throw new Error(
        "Sem entrada recente registrada para este usuario. Aguarde uma mensagem dele ou envie uma notificacao por template.",
      );
    }

    const adminDisplayName = getAdminDisplayName(adminProfile, user);
    let payload:
      | {
          contacts?: Array<{ wa_id?: string }>;
          messages?: Array<{ id?: string }>;
        }
      | null = null;
    let messageType = sendTemplateOnly ? "template" : "text";
    let messageBody = sendTemplateOnly ? ADMIN_OUTSIDE_WINDOW_TEMPLATE_PREVIEW : text;
    let storedMedia: Record<string, unknown> | null = null;

    if (sendTemplateOnly) {
      payload = await sendTemplateMessage({
        to,
        templateName: ADMIN_OUTSIDE_WINDOW_TEMPLATE_NAME,
      });
    } else if (audio) {
      const fileName = sanitizeFileName(String(audio.fileName || "").trim()) || "audio.ogg";
      const mimeType = String(audio.mimeType || "").trim() || "audio/ogg";
      const bytes = decodeBase64(String(audio.base64 || ""));
      const extension = getFileExtensionFromMimeType(mimeType);
      const timestamp = Date.now();
      const storagePath = `whatsapp-outbound-audio/${adminProfile.id}/${timestamp}-${fileName.replace(/\.[^.]+$/, "")}.${extension}`;

      await uploadToStorage("requisicoes", storagePath, bytes, mimeType);
      const mediaId = await uploadWhatsAppMedia({
        bytes,
        fileName,
        mimeType,
      });

      storedMedia = {
        fileName,
        storageBucket: "requisicoes",
        storagePath,
        uploadedAt: new Date().toISOString(),
        mimeType,
        kind: "audio",
        whatsappMediaId: mediaId,
      };
      payload = await sendAudioMessage({ to, audioMediaId: mediaId });
      messageType = "audio";
      messageBody = "[audio enviado]";
    } else {
      const outboundText = `*${adminDisplayName}:*\n${text}`;
      payload = await sendTextMessage({ to, text: outboundText });
    }

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
        message_type: messageType,
        body: messageBody,
        occurred_at: new Date().toISOString(),
        raw_payload: {
          ...payload,
          adminName: adminProfile.nome,
          adminEmail: adminProfile.email || user.email || null,
          outboundBody: sendTemplateOnly
            ? ADMIN_OUTSIDE_WINDOW_TEMPLATE_PREVIEW
            : text
              ? `*${adminDisplayName}:*\n${text}`
              : null,
          source: sendTemplateOnly ? "admin-whatsapp-template" : "admin-whatsapp-reply",
          audience: "user",
          notificationType: sendTemplateOnly ? "adminOutsideWindow" : null,
          templateName: sendTemplateOnly ? ADMIN_OUTSIDE_WINDOW_TEMPLATE_NAME : null,
          stored_media: storedMedia,
          sentBy: {
            id: adminProfile.id,
            name: adminDisplayName,
            email: adminProfile.email || user.email || null,
            authUserId: user.id,
          },
        },
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
