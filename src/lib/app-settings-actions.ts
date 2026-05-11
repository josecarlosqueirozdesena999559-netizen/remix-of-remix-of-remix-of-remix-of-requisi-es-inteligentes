import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildWelcomeTemplateParameters,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/whatsapp-templates";
import { sendWhatsAppTemplateMessage } from "@/lib/whatsapp.server";

const WHATSAPP_ADMIN_NUMBERS_KEY = "WHATSAPP_ADMIN_NUMBERS";

function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;

  throw new Error(`WhatsApp invalido: ${value}`);
}

function parseNumbers(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
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

  throw new Error("Apenas administradores podem alterar esta configuracao.");
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

export const getWhatsAppAdminNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin((context as any).userId, (context as any).claims?.email);

    return {
      numbers: await getSavedAdminNumbers(),
    };
  });

export const saveWhatsAppAdminNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId, (context as any).claims?.email);

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
