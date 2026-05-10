import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildRequestTemplateParameters,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/whatsapp-templates";
import {
  normalizeWhatsAppPhoneNumber,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsapp.server";

type SaveUserWhatsAppInput = {
  profileId: string;
  whatsapp: string;
};

type RequestNotificationInput = {
  requestId: string;
};

function validateSaveUserWhatsAppInput(input: unknown): SaveUserWhatsAppInput {
  if (!input || typeof input !== "object") {
    throw new Error("Dados do WhatsApp inválidos.");
  }

  const data = input as Partial<SaveUserWhatsAppInput>;

  if (!data.profileId || typeof data.profileId !== "string") {
    throw new Error("Perfil do usuário não informado.");
  }

  if (!data.whatsapp || typeof data.whatsapp !== "string") {
    throw new Error("Informe o número do WhatsApp.");
  }

  return {
    profileId: data.profileId,
    whatsapp: data.whatsapp,
  };
}

function validateRequestNotificationInput(input: unknown): RequestNotificationInput {
  if (!input || typeof input !== "object") {
    throw new Error("Dados da requisição inválidos.");
  }

  const data = input as Partial<RequestNotificationInput>;

  if (!data.requestId || typeof data.requestId !== "string") {
    throw new Error("Requisição não informada.");
  }

  return { requestId: data.requestId };
}

async function getRequestNotificationData(requestId: string) {
  const { data: request, error: requestError } = await (supabaseAdmin as any)
    .from("requisicoes")
    .select("id,saida_codigo,categoria,data,solicitante,solicitante_cpf")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Requisição não encontrada.");

  let profile: { whatsapp: string | null; nome: string | null } | null = null;

  if (request.solicitante_cpf) {
    const { data: profileByCpf, error: profileError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("nome,whatsapp")
      .eq("cpf", request.solicitante_cpf)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    profile = profileByCpf;
  }

  if (!profile && request.solicitante) {
    const { data: profileByName, error: profileError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("nome,whatsapp")
      .eq("nome", request.solicitante)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    profile = profileByName;
  }

  const whatsapp = profile?.whatsapp?.trim();

  return {
    whatsapp,
    requestCode: request.saida_codigo || request.id,
    materialType: request.categoria,
    requestDate: request.data,
    requesterName: profile?.nome || request.solicitante,
  };
}

async function sendRequestNotification(
  requestId: string,
  templateName: string,
) {
  const notificationData = await getRequestNotificationData(requestId);

  if (!notificationData.whatsapp) {
    return {
      skipped: true,
      reason: "Usuário sem WhatsApp cadastrado.",
    };
  }

  const messageResult = await sendWhatsAppTemplateMessage({
    to: notificationData.whatsapp,
    templateName,
    languageCode: WHATSAPP_TEMPLATE_LANGUAGE,
    bodyParameters: buildRequestTemplateParameters(notificationData),
  });

  return {
    skipped: false,
    messageId: messageResult.messageId,
  };
}

export const saveUserWhatsAppAndSendWelcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const input = validateSaveUserWhatsAppInput(data);
    const whatsapp = normalizeWhatsAppPhoneNumber(input.whatsapp);
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;

    const { data: profile, error: profileError } = await supabase
      .from("usuarios")
      .select("id,nome,whatsapp")
      .eq("id", input.profileId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Perfil do usuário não encontrado.");

    const { error: updateError } = await supabase
      .from("usuarios")
      .update({ auth_user_id: userId, whatsapp })
      .eq("id", input.profileId);

    if (updateError) throw new Error(updateError.message);

    const messageResult = await sendWhatsAppTemplateMessage({
      to: whatsapp,
      templateName: WHATSAPP_TEMPLATE_NAMES.welcome,
      languageCode: WHATSAPP_TEMPLATE_LANGUAGE,
    });

    return {
      whatsapp,
      messageId: messageResult.messageId,
    };
  });

export const notifyRequestCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const input = validateRequestNotificationInput(data);
    return sendRequestNotification(input.requestId, WHATSAPP_TEMPLATE_NAMES.requestCreated);
  });

export const notifyOutputAttached = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const input = validateRequestNotificationInput(data);
    return sendRequestNotification(input.requestId, WHATSAPP_TEMPLATE_NAMES.outputAttached);
  });

export const notifyRequestReadyForPickup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const input = validateRequestNotificationInput(data);
    return sendRequestNotification(input.requestId, WHATSAPP_TEMPLATE_NAMES.readyForPickup);
  });
