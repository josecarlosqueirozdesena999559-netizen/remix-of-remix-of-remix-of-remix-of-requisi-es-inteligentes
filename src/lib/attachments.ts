import { supabase } from "@/integrations/supabase/client";

export interface AttachmentFile {
  fileName?: string;
  storageBucket?: string;
  storagePath?: string;
  url?: string;
  publicUrl?: string;
  signedUrl?: string;
}

interface SignedAttachmentPayload extends AttachmentFile {
  request?: AttachmentFile | null;
  output?: AttachmentFile | null;
}

export function getRequestSignedAttachment(signedAttachment: unknown, status?: string | null) {
  const attachment = signedAttachment as SignedAttachmentPayload | null;
  if (!attachment) return null;

  if (attachment.request || attachment.output) {
    return attachment.request || null;
  }

  return status === "concluido" ? null : attachment;
}

export function getOutputSignedAttachment(signedAttachment: unknown, status?: string | null) {
  const attachment = signedAttachment as SignedAttachmentPayload | null;
  if (!attachment) return null;

  if (attachment.request || attachment.output) {
    return attachment.output || null;
  }

  return status === "concluido" ? attachment : null;
}

export async function resolveAttachmentUrl(attachment: AttachmentFile | null | undefined) {
  if (!attachment) return "";

  if (attachment.signedUrl || attachment.publicUrl || attachment.url) {
    return attachment.signedUrl || attachment.publicUrl || attachment.url || "";
  }

  if (!attachment.storageBucket || !attachment.storagePath) {
    return "";
  }

  const { data, error } = await supabase.storage
    .from(attachment.storageBucket)
    .createSignedUrl(attachment.storagePath, 60 * 60);

  if (error) {
    throw new Error(error.message);
  }

  return data?.signedUrl || "";
}
