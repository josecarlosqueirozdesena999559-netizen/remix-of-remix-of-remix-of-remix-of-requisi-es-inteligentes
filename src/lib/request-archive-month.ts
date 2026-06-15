import {
  getAttachmentFile,
  getOutputSignedAttachment,
  type AttachmentFile,
} from "@/lib/attachments";

interface ArchiveMonthRequest {
  data?: string | null;
  created_at: string;
  status?: string | null;
  signed_attachment?: unknown;
  admin_attachment?: unknown;
}

function extractYearMonth(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const brDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brDate) return `${brDate[3]}-${brDate[2].padStart(2, "0")}`;

  const isoDate = raw.match(/^(\d{4})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function getOutputReferenceMonth(
  outputAttachment: AttachmentFile | null | undefined,
  adminAttachment: AttachmentFile | null | undefined,
) {
  return (
    extractYearMonth(adminAttachment?.uploadedAt) ||
    extractYearMonth(outputAttachment?.sourceUploadedAt) ||
    extractYearMonth(outputAttachment?.uploadedAt)
  );
}

export function getRequestArchiveMonth(request: ArchiveMonthRequest) {
  const outputAttachment = getOutputSignedAttachment(request.signed_attachment, request.status);
  const adminAttachment = getAttachmentFile(request.admin_attachment);

  return (
    getOutputReferenceMonth(outputAttachment, adminAttachment) ||
    extractYearMonth(request.data) ||
    extractYearMonth(request.created_at)
  );
}
