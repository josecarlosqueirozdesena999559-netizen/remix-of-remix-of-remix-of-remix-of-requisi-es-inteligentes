import {
  getAttachmentFiles,
  getOutputSignedAttachments,
  getRequestSignedAttachment,
  resolveAttachmentUrl,
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
  const outputAttachments =
    getOutputSignedAttachments(request.signed_attachment, request.status).length > 0
      ? getOutputSignedAttachments(request.signed_attachment, request.status)
      : getAttachmentFiles(request.admin_attachment);

  const [outputUrls, requestUrl] = await Promise.all([
    Promise.all(outputAttachments.map((attachment) => resolveAttachmentUrl(attachment))),
    resolveAttachmentUrl(requestAttachment),
  ]);

  if (outputUrls.some(Boolean) || requestUrl) {
    return await createCombinedSignedPdfBlob(outputUrls.filter(Boolean), requestUrl);
  }

  return await createRequestPdfBlob(
    await resolveRequestForPdf({ ...request, items: request.items ?? null }, code),
  );
}
