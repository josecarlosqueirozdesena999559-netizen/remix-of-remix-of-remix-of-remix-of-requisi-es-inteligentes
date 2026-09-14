import { supabase } from "@/integrations/supabase/client";
import { getAttachmentFiles, type AttachmentFile } from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";

export const AVULSA_PENDING_STATUSES = ["aguardando_assinatura", "devolvido"] as const;
export const AVULSA_SIGNED_STATUS = "assinado";

export function getAvulsaDisplayCode(row: Pick<AvulsaSignatureRow, "id" | "avulsa_codigo">) {
  return row.avulsa_codigo?.trim() || row.id.slice(0, 8);
}

export interface AvulsaSignatureRow {
  id: string;
  avulsa_codigo: string | null;
  saida_codigo: string | null;
  usuario_id: string;
  solicitante: string;
  solicitante_cpf: string | null;
  setor: string | null;
  titulo: string;
  observacao: string | null;
  status: string;
  admin_attachment: unknown;
  signed_attachment: unknown;
  return_reason: string | null;
  returned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  signed_at: string | null;
}

export interface AvulsaUserOption {
  id: string;
  nome: string;
  usuario: string | null;
  email: string | null;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  local_nome?: string | null;
  display_nome?: string | null;
  display_cpf?: string | null;
  option_key?: string;
}

export function getAvulsaStatusLabel(status: string) {
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  if (status === "devolvido") return "Devolvido pelo usuario";
  if (status === "assinado") return "Assinado";
  if (status === "excluido_admin") return "Excluido";
  return status || "-";
}

export function assinaturaAvulsaBlocksNewRequest(row: Pick<AvulsaSignatureRow, "status">) {
  return row.status === "aguardando_assinatura" || row.status === "devolvido";
}

export function getAvulsaAttachmentFile(value: unknown): AttachmentFile | null {
  return getAvulsaAttachmentFiles(value).at(-1) || null;
}

export function getAvulsaAttachmentFiles(value: unknown): AttachmentFile[] {
  return getAttachmentFiles(value).filter(
    (attachment) =>
      attachment.storagePath || attachment.url || attachment.publicUrl || attachment.signedUrl,
  );
}

export function getRequiredAvulsaSignatureCount(row: Pick<AvulsaSignatureRow, "admin_attachment">) {
  return Math.max(1, getAvulsaAttachmentFiles(row.admin_attachment).length);
}

export async function uploadAvulsaPdf(params: {
  file: File;
  assinaturaId: string;
  signed: boolean;
  index?: number;
}) {
  const safeName = sanitizeFileName(params.file.name) || "documento.pdf";
  const folder = params.signed ? "assinaturas-avulsas-assinadas" : "assinaturas-avulsas";
  const prefix = params.index === undefined ? "" : `${params.index + 1}-`;
  const storagePath = `${folder}/${params.assinaturaId}/${Date.now()}-${prefix}${safeName}`;
  const attachment: AttachmentFile = {
    fileName: params.file.name,
    storageBucket: REQUISICOES_BUCKET,
    storagePath,
    uploadedAt: new Date().toISOString(),
    mimeType: params.file.type || "application/pdf",
    kind: "request",
  };

  const { error } = await supabase.storage
    .from(REQUISICOES_BUCKET)
    .upload(storagePath, params.file, {
      contentType: params.file.type || "application/pdf",
      upsert: true,
    });

  if (error) throw new Error(error.message);

  return attachment;
}

export async function uploadAvulsaPdfs(params: {
  files: File[];
  assinaturaId: string;
  signed: boolean;
}) {
  const attachments: AttachmentFile[] = [];

  for (const [index, file] of params.files.entries()) {
    attachments.push(
      await uploadAvulsaPdf({
        file,
        assinaturaId: params.assinaturaId,
        signed: params.signed,
        index,
      }),
    );
  }

  return attachments;
}

export function isPdfFile(file: File | null | undefined) {
  return Boolean(
    file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")),
  );
}
