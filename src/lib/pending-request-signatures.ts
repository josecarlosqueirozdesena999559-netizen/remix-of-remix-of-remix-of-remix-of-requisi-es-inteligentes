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

function normalizeUserKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

const PENDING_SIGNATURE_BLOCK_BYPASS_USERS = new Set(["kenedy", "kenedi"]);

function isBypassUserKey(value: string) {
  if (PENDING_SIGNATURE_BLOCK_BYPASS_USERS.has(value)) return true;

  const firstToken = value.split(/[\s._-]+/)[0] || "";
  return PENDING_SIGNATURE_BLOCK_BYPASS_USERS.has(firstToken);
}

function canBypassPendingSignatureBlock(profile: RequestOwnerProfile) {
  const usuario = normalizeUserKey(profile.usuario);
  const nome = normalizeUserKey(profile.nome);
  const emailUser = normalizeUserKey(profile.email).split("@")[0] || "";

  return isBypassUserKey(usuario) || isBypassUserKey(nome) || isBypassUserKey(emailUser);
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
  if (canBypassPendingSignatureBlock(profile)) {
    return false;
  }

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
