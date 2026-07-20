import { supabase } from "@/integrations/supabase/client";
import {
  getOutputSignedAttachment,
  getRequestSignedAttachment,
} from "@/lib/attachments";
import {
  getRequestOwnerCpf,
  getRequestOwnerLocation,
  type RequestOwnerProfile,
} from "@/lib/request-owner";

export const BLOCK_NEW_REQUEST_MESSAGE =
  "Você não pode fazer novos pedidos porque tem assinaturas pendentes.";

interface PendingSignatureRequest {
  id: string;
  status: string;
  signed_attachment: unknown;
}

export function requestNeedsSignature(request: PendingSignatureRequest) {
  if (request.status === "aguardando_assinatura_saida") {
    return !getOutputSignedAttachment(request.signed_attachment, request.status);
  }

  if (request.status === "correcao_requisicao") {
    return true;
  }

  return !getRequestSignedAttachment(request.signed_attachment, request.status);
}

export async function hasPendingRequestSignatures(profile: RequestOwnerProfile) {
  const cpf = getRequestOwnerCpf(profile);
  const location = getRequestOwnerLocation(profile);
  const name = profile.nome?.trim() || "";

  let query = supabase
    .from("requisicoes")
    .select("id,status,signed_attachment")
    .in("status", [
      "aguardando_assinatura",
      "aguardando_assinatura_requisicao",
      "aguardando_assinatura_saida",
      "correcao_requisicao",
    ])
    .order("updated_at", { ascending: false });

  if (cpf) {
    query = query.eq("solicitante_cpf", cpf);
  } else if (name && location) {
    query = query.eq("solicitante", name).eq("setor", location);
  } else {
    return false;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PendingSignatureRequest[]).some(requestNeedsSignature);
}
