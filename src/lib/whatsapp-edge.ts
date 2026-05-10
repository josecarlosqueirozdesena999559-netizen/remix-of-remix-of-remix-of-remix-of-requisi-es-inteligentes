import { supabase } from "@/integrations/supabase/client";

type RequestNotificationType = "requestCreated" | "outputAttached" | "readyForPickup";

export async function notifyRequestByWhatsApp(input: {
  requestId: string;
  notificationType: RequestNotificationType;
}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sessao expirada.");

  const { data: result, error } = await supabase.functions.invoke("notify-request-whatsapp", {
    body: input,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(error.message);
  if (!result?.ok) throw new Error(result?.error || "Erro ao enviar WhatsApp.");

  return result as {
    ok: true;
    skipped?: boolean;
    reason?: string;
    messageId?: string;
  };
}
