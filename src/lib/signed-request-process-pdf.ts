import {
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  resolveAttachmentUrl,
  type AttachmentFile,
} from "@/lib/attachments";
import { createCombinedSignedPdfBlob } from "@/lib/combined-pdf";
import { createRequestPdfBlob, type RequestPdfItem } from "@/lib/request-pdf";
import { resolveRequestForPdf } from "@/lib/request-resolver";

export interface SignedRequestProcessPdfRow {
  id: string;
  saida_codigo: string | null;
  categoria: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  solicitante_funcao: string | null;
  data: string | null;
  created_at: string;
  status: string;
  items?: RequestPdfItem[] | null;
  signed_attachment: unknown;
  admin_attachment: unknown;
}

export function getSignedRequestProcessCode(request: Pick<SignedRequestProcessPdfRow, "id" | "saida_codigo">) {
  return request.saida_codigo || request.id;
}

export async function createSignedRequestProcessPdfBlob(request: SignedRequestProcessPdfRow) {
  const code = getSignedRequestProcessCode(request);
  const requestAttachment = getRequestSignedAttachment(request.signed_attachment, request.status);
  const outputAttachment =
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
    (getAttachmentFile(request.admin_attachment) as AttachmentFile | null);

  const [outputUrl, requestUrl] = await Promise.all([
    resolveAttachmentUrl(outputAttachment),
    resolveAttachmentUrl(requestAttachment),
  ]);

  if (outputUrl || requestUrl) {
    return await createCombinedSignedPdfBlob(outputUrl, requestUrl);
  }

  return await createRequestPdfBlob(
    await resolveRequestForPdf({ ...request, items: request.items ?? null }, code),
  );
}
