import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildRequestTemplateParameters,
  buildWelcomeTemplateParameters,
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATE_NAMES,
} from "@/lib/whatsapp-templates";
import {
  normalizeWhatsAppPhoneNumber,
  sendWhatsAppTemplateMessage,
} from "@/lib/whatsapp.server";
import { buildGlobalRequestCodes, formatRequestCodeDate } from "@/lib/request-code";

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
    throw new Error("Dados da solicitação inválidos.");
  }

  const data = input as Partial<RequestNotificationInput>;

  if (!data.requestId || typeof data.requestId !== "string") {
    throw new Error("Solicitação não informada.");
  }

  return { requestId: data.requestId };
}

async function getRequestNotificationData(requestId: string) {
  const { data: request, error: requestError } = await (supabaseAdmin as any)
    .from("requisicoes")
    .select("id,saida_codigo,categoria,data,created_at,solicitante,solicitante_cpf")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Solicitação não encontrada.");

  let requestCode = request.saida_codigo?.trim();
  if (!requestCode) {
    const { data: requests, error: requestsError } = await (supabaseAdmin as any)
      .from("requisicoes")
      .select("id,saida_codigo,data,created_at")
      .order("created_at", { ascending: true });

    if (requestsError) throw new Error(requestsError.message);

    requestCode =
      buildGlobalRequestCodes(requests ?? []).get(request.id) ||
      `${formatRequestCodeDate(request.data || request.created_at)}001`;

    const { error: updateError } = await (supabaseAdmin as any)
      .from("requisicoes")
      .update({ saida_codigo: requestCode })
      .eq("id", request.id);

    if (updateError) throw new Error(updateError.message);
  }

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
    requestCode,
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
    const userId = (context as any).userId;
    const userEmail = (context as any).claims?.email as string | undefined;

    const { data: profile, error: profileError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,nome,email,auth_user_id,whatsapp")
      .eq("id", input.profileId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Perfil do usuário não encontrado.");

    const profileEmail = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    const currentUserEmail = userEmail?.trim().toLowerCase() || "";
    const belongsToCurrentUser =
      profile.auth_user_id === userId || (!profile.auth_user_id && profileEmail === currentUserEmail);

    if (!belongsToCurrentUser) {
      throw new Error("Você não tem permissão para alterar este perfil.");
    }

    const { data: updatedProfile, error: updateError } = await (supabaseAdmin as any)
      .from("usuarios")
      .update({ auth_user_id: userId, whatsapp })
      .eq("id", input.profileId)
      .select("whatsapp")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!updatedProfile?.whatsapp) {
      throw new Error("Não foi possível salvar o WhatsApp do usuário.");
    }

    let messageId: string | undefined;
    let welcomeError: string | undefined;

    try {
      const messageResult = await sendWhatsAppTemplateMessage({
        to: whatsapp,
        templateName: WHATSAPP_TEMPLATE_NAMES.welcome,
        languageCode: WHATSAPP_TEMPLATE_LANGUAGE,
        bodyParameters: buildWelcomeTemplateParameters({
          requesterName: profile.nome,
        }),
      });
      messageId = messageResult.messageId;
    } catch (error) {
      welcomeError =
        error instanceof Error
          ? error.message
          : "WhatsApp salvo, mas não foi possível enviar a mensagem de boas-vindas.";
    }

    return {
      whatsapp: updatedProfile.whatsapp,
      messageId,
      welcomeError,
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
