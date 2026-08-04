import { supabase } from "@/integrations/supabase/client";

export interface AttachmentFile {
  fileName?: string;
  storageBucket?: string;
  storagePath?: string;
  url?: string;
  publicUrl?: string;
  signedUrl?: string;
  uploadedAt?: string;
  sourceUploadedAt?: string;
  mimeType?: string;
  kind?: "request" | "output" | "audio" | "image" | "video";
}

interface SignedAttachmentPayload extends AttachmentFile {
  request?: AttachmentFile | null;
  output?: AttachmentFile | null;
  outputs?: AttachmentFile[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function toAttachmentFile(value: unknown): AttachmentFile | null {
  if (!isRecord(value)) return null;

  const attachment: AttachmentFile = {};

  if (typeof value.fileName === "string") attachment.fileName = value.fileName;
  if (typeof value.storageBucket === "string") attachment.storageBucket = value.storageBucket;
  if (typeof value.storagePath === "string") attachment.storagePath = value.storagePath;
  if (typeof value.url === "string") attachment.url = value.url;
  if (typeof value.publicUrl === "string") attachment.publicUrl = value.publicUrl;
  if (typeof value.signedUrl === "string") attachment.signedUrl = value.signedUrl;
  if (typeof value.uploadedAt === "string") attachment.uploadedAt = value.uploadedAt;
  if (typeof value.sourceUploadedAt === "string") attachment.sourceUploadedAt = value.sourceUploadedAt;
  if (typeof value.mimeType === "string") attachment.mimeType = value.mimeType;
  if (
    value.kind === "request" ||
    value.kind === "output" ||
    value.kind === "audio" ||
    value.kind === "image" ||
    value.kind === "video"
  ) {
    attachment.kind = value.kind;
  }

  return Object.keys(attachment).length > 0 ? attachment : null;
}

function hasStructuredSignedAttachmentParts(value: Record<string, unknown>) {
  return "request" in value || "output" in value || "outputs" in value;
}

export function getAttachmentFiles(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(toAttachmentFile).filter((attachment): attachment is AttachmentFile => Boolean(attachment));
  }

  const attachment = toAttachmentFile(value);
  return attachment ? [attachment] : [];
}

export function getAttachmentFile(value: unknown) {
  const files = getAttachmentFiles(value);
  return files.at(-1) || null;
}

export function getSignedAttachmentParts(signedAttachment: unknown, status?: string | null) {
  const attachment = signedAttachment as SignedAttachmentPayload | null;
  if (!isRecord(attachment)) {
    return {
      request: null,
      output: null,
      outputs: [],
    };
  }

  const legacyAttachment = toAttachmentFile(attachment);
  const requestAttachment = toAttachmentFile(attachment.request);
  const outputAttachment = toAttachmentFile(attachment.output);
  const outputAttachments = getAttachmentFiles(attachment.outputs);

  if (hasStructuredSignedAttachmentParts(attachment)) {
    return {
      request: requestAttachment || legacyAttachment,
      output: outputAttachment || null,
      outputs: outputAttachments.length > 0 ? outputAttachments : outputAttachment ? [outputAttachment] : [],
    };
  }

  if (status === "concluido") {
    return {
      request: null,
      output: legacyAttachment,
      outputs: legacyAttachment ? [legacyAttachment] : [],
    };
  }

  return {
    request: legacyAttachment,
    output: null,
    outputs: [],
  };
}

export function buildSignedAttachmentPayload(
  signedAttachment: unknown,
  updates: {
    request?: AttachmentFile | null;
    output?: AttachmentFile | null;
    outputs?: AttachmentFile[] | null;
  },
) {
  const current = getSignedAttachmentParts(signedAttachment);
  const nextOutput = updates.output === undefined ? current.output : updates.output;
  const nextOutputs =
    updates.outputs === undefined
      ? updates.output === undefined
        ? current.outputs
        : nextOutput
          ? [nextOutput]
          : []
      : updates.outputs || [];

  return {
    request: updates.request === undefined ? current.request : updates.request,
    output: nextOutput || nextOutputs.at(-1) || null,
    outputs: nextOutputs,
  };
}

export function getRequestSignedAttachment(signedAttachment: unknown, _status?: string | null) {
  const { request } = getSignedAttachmentParts(signedAttachment, _status);
  return request;
}

export function getOutputSignedAttachment(signedAttachment: unknown, _status?: string | null) {
  const { output } = getSignedAttachmentParts(signedAttachment, _status);
  return output;
}

export function getOutputSignedAttachments(signedAttachment: unknown, _status?: string | null) {
  const { output, outputs } = getSignedAttachmentParts(signedAttachment, _status);
  return outputs.length > 0 ? outputs : output ? [output] : [];
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
    const message = String(error.message || "").toLowerCase();
    if (message.includes("object not found")) {
      return "";
    }

    throw new Error(error.message);
  }

  return data?.signedUrl || "";
}

export async function removeAttachmentFile(attachment: AttachmentFile | null | undefined) {
  if (!attachment?.storageBucket || !attachment.storagePath) return;

  const { error } = await supabase.storage
    .from(attachment.storageBucket)
    .remove([attachment.storagePath]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function removeAttachmentFileSafely(
  attachment: AttachmentFile | null | undefined,
  context = "attachment",
) {
  try {
    await removeAttachmentFile(attachment);
  } catch (error) {
    console.warn(`Could not remove ${context}.`, error);
  }
}
