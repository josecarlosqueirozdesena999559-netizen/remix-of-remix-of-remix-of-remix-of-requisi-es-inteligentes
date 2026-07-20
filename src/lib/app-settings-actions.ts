import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildWelcomeTemplateParameters,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/whatsapp-templates";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp.server";

const WHATSAPP_ADMIN_NUMBERS_KEY = "WHATSAPP_ADMIN_NUMBERS";
const WHATSAPP_ACCESS_TOKEN_KEY = "WHATSAPP_ACCESS_TOKEN";
const WHATSAPP_PHONE_NUMBER_ID_KEY = "WHATSAPP_PHONE_NUMBER_ID";
const WHATSAPP_GRAPH_API_VERSION_KEY = "WHATSAPP_GRAPH_API_VERSION";
const WHATSAPP_CONFIG_KEYS = [
  WHATSAPP_ACCESS_TOKEN_KEY,
  WHATSAPP_PHONE_NUMBER_ID_KEY,
  WHATSAPP_GRAPH_API_VERSION_KEY,
] as const;

type ServerFnAuthPayload = {
  accessToken?: string | null;
};

type WhatsAppConfigInput = ServerFnAuthPayload & {
  whatsappAccessToken?: string | null;
  phoneNumberId?: string | null;
  graphApiVersion?: string | null;
};

function getAccessToken(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const value = (input as ServerFnAuthPayload).accessToken;
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  if (digits.startsWith("55") && digits.length === 13) return digits;

  throw new Error(`WhatsApp invalido: ${value}`);
}

function extractLegacyConcatenatedNumbers(value: string) {
  return value.match(/55\d{10,11}(?=55|$)/g) ?? [];
}

function parseNumbers(value: string) {
  const normalizedValue = value.trim();
  const rawNumbers =
    /[\n,;]/.test(normalizedValue) || !normalizedValue.includes("55")
      ? normalizedValue
          .split(/[\n,;]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : extractLegacyConcatenatedNumbers(normalizedValue);

  return rawNumbers
    .map(normalizeWhatsAppPhoneNumber)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function mergeAdminNumbers(previousNumbers: string[], newNumbers: string[]) {
  return [...new Set([...previousNumbers, ...newNumbers])];
}

type AdminWelcomeNotification = {
  to: string;
  ok: boolean;
  messageId?: string;
  error?: string;
};

async function requireAdmin(userId: string, email?: string | null) {
  const { data: profile, error } = await (supabaseAdmin as any)
    .from("usuarios")
    .select("id,is_admin")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (profile?.is_admin) return;

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    const { data: profileByEmail, error: emailError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,is_admin")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (emailError) throw new Error(emailError.message);
    if (profileByEmail?.is_admin) return;
  }

  throw new Error("Apenas administradores podem alterar esta configuração.");
}

async function requireAdminFromAccessToken(input: unknown) {
  const accessToken = getAccessToken(input);
  if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

  const { data, error } = await (supabaseAdmin as any).auth.getUser(accessToken);
  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user?.id) throw new Error("Sessão expirada. Entre novamente.");

  await requireAdmin(user.id, user.email);
}

async function getSavedAdminNumbers() {
  const { data, error } = await (supabaseAdmin as any)
    .from("app_settings")
    .select("value")
    .eq("key", WHATSAPP_ADMIN_NUMBERS_KEY)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return parseNumbers(data?.value || "");
}

async function getSavedWhatsAppConfig() {
  const { data, error } = await (supabaseAdmin as any)
    .from("app_settings")
    .select("key,value")
    .in("key", WHATSAPP_CONFIG_KEYS);

  if (error) throw new Error(error.message);

  const settings = new Map(
    ((data ?? []) as Array<{ key: string; value: string | null }>).map((setting) => [
      setting.key,
      setting.value || "",
    ]),
  );

  const accessToken = settings.get(WHATSAPP_ACCESS_TOKEN_KEY)?.trim() || "";

  return {
    hasAccessToken: Boolean(accessToken),
    accessTokenPreview: accessToken ? `${accessToken.slice(0, 8)}...${accessToken.slice(-4)}` : "",
    phoneNumberId: settings.get(WHATSAPP_PHONE_NUMBER_ID_KEY)?.trim() || "",
    graphApiVersion: settings.get(WHATSAPP_GRAPH_API_VERSION_KEY)?.trim() || "v25.0",
  };
}

async function sendAdminWelcomeNotifications(
  numbers: string[],
): Promise<AdminWelcomeNotification[]> {
  const results = await Promise.allSettled(
    numbers.map((number) =>
      sendWhatsAppTemplateMessage({
        to: number,
        templateName: WHATSAPP_TEMPLATE_NAMES.welcome,
        languageCode: WHATSAPP_TEMPLATE_LANGUAGE,
        bodyParameters: buildWelcomeTemplateParameters({
          requesterName: "Administrador",
        }),
      }),
    ),
  );

  return results.map((result, index) => ({
    to: numbers[index],
    ok: result.status === "fulfilled",
    messageId: result.status === "fulfilled" ? result.value.messageId : undefined,
    error: result.status === "rejected" ? String(result.reason?.message || result.reason) : undefined,
  }));
}

export const getWhatsAppAdminNumbers = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    return {
      numbers: await getSavedAdminNumbers(),
    };
  });

export const saveWhatsAppAdminNumbers = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    const rawNumbers =
      data && typeof data === "object" && typeof (data as any).numbers === "string"
        ? (data as any).numbers
        : "";
    const previousNumbers = await getSavedAdminNumbers();
    const parsedNumbers = parseNumbers(rawNumbers);
    const numbers = mergeAdminNumbers(previousNumbers, parsedNumbers);
    const newNumbers = numbers.filter((number) => !previousNumbers.includes(number));

    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert(
        {
          key: WHATSAPP_ADMIN_NUMBERS_KEY,
          value: numbers.join(","),
        },
        { onConflict: "key" },
      );

    if (error) throw new Error(error.message);

    const welcomeNotifications = await sendAdminWelcomeNotifications(newNumbers);

    return { numbers, welcomeNotifications };
  });

export const getWhatsAppConfigSettings = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    return getSavedWhatsAppConfig();
  });

export const saveWhatsAppConfigSettings = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    const input = (data && typeof data === "object" ? data : {}) as WhatsAppConfigInput;
    const whatsappAccessToken = input.whatsappAccessToken?.trim() || "";
    const phoneNumberId = input.phoneNumberId?.trim() || "";
    const graphApiVersion = input.graphApiVersion?.trim() || "v25.0";

    if (!phoneNumberId) throw new Error("Informe o ID do número do WhatsApp.");
    if (!graphApiVersion.startsWith("v")) throw new Error("A versão da API deve ficar no formato v25.0.");

    const currentConfig = await getSavedWhatsAppConfig();
    if (!whatsappAccessToken && !currentConfig.hasAccessToken) {
      throw new Error("Informe o token de acesso do WhatsApp.");
    }

    const rows = [
      {
        key: WHATSAPP_PHONE_NUMBER_ID_KEY,
        value: phoneNumberId,
      },
      {
        key: WHATSAPP_GRAPH_API_VERSION_KEY,
        value: graphApiVersion,
      },
    ];

    if (whatsappAccessToken) {
      rows.push({
        key: WHATSAPP_ACCESS_TOKEN_KEY,
        value: whatsappAccessToken,
      });
    }

    const { error } = await (supabaseAdmin as any)
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });

    if (error) throw new Error(error.message);

    return getSavedWhatsAppConfig();
  });
