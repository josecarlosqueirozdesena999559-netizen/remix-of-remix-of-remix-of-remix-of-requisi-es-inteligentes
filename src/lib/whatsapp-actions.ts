import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizeWhatsAppPhoneNumber,
  sendWhatsAppTextMessage,
} from "@/lib/whatsapp.server";

const WELCOME_MESSAGE =
  "Bem-vindo ao Almoxarifado da Saúde. Por aqui você será notificado se tiver pendências ou quando seu pedido estiver separado.";

type SaveUserWhatsAppInput = {
  profileId: string;
  whatsapp: string;
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

    const messageResult = await sendWhatsAppTextMessage({
      to: whatsapp,
      body: WELCOME_MESSAGE,
    });

    return {
      whatsapp,
      messageId: messageResult.messageId,
    };
  });
