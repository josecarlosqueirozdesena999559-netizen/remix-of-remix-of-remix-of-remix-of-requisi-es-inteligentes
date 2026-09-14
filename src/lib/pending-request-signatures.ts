import { supabase } from "@/integrations/supabase/client";
import { assinaturaAvulsaBlocksNewRequest, type AvulsaSignatureRow } from "@/lib/avulsa-signatures";
import { getOutputSignedAttachment, getRequestSignedAttachment } from "@/lib/attachments";
import {
  getRequestOwnerCpfVariants,
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

  const cpfVariants = getRequestOwnerCpfVariants(profile);
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

  if (cpfVariants.length > 0) {
    query = query.in("solicitante_cpf", cpfVariants);
  } else if (name && location) {
    query = query.eq("solicitante", name).eq("setor", location);
  } else {
    return false;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if (((data ?? []) as PendingSignatureRequest[]).some(requestNeedsSignature)) {
    return true;
  }

  const userId = "id" in profile ? String(profile.id || "") : "";
  if (!userId) return false;

  const { data: avulsas, error: avulsasError } = await supabase
    .from("assinaturas_avulsas" as any)
    .select("id,status")
    .eq("usuario_id", userId)
    .in("status", ["aguardando_assinatura", "devolvido"]);

  if (avulsasError) {
    throw new Error(avulsasError.message);
  }

  return ((avulsas ?? []) as AvulsaSignatureRow[]).some(assinaturaAvulsaBlocksNewRequest);
}
