export const SIGNATURE_OTP_TTL_SECONDS = 60;
export const SIGNATURE_OTP_TEMPLATE_NAME = "assinatura_documento_otp";
export const SIGNATURE_OTP_TEMPLATE_LANGUAGE = "pt_BR";

export type WhatsAppOtpConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

export function generateSixDigitOtp() {
  const range = 0x1_0000_0000;
  const ceiling = Math.floor(range / 1_000_000) * 1_000_000;
  const random = new Uint32Array(1);
  let value = ceiling;
  while (value >= ceiling) {
    crypto.getRandomValues(random);
    value = random[0];
  }
  return String(value % 1_000_000).padStart(6, "0");
}

export async function hashSignatureOtp(
  serverKey: string,
  userId: string,
  signatureRequestId: string,
  previewSha256: string,
  code: string,
) {
  if (!serverKey) throw new Error("Chave segura de assinatura não configurada.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = `signature-whatsapp-otp:v1:${userId}:${signatureRequestId}:${previewSha256}:${code}`;
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  if (!digits.startsWith("55") || digits.length !== 13) {
    throw new Error("O WhatsApp cadastrado no perfil do usuário não é válido.");
  }
  return digits;
}

export function maskWhatsAppPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "final não disponível";
  return `•••• ${digits.slice(-4)}`;
}

export async function sendWhatsAppAuthenticationOtp(
  config: WhatsAppOtpConfig,
  recipient: string,
  code: string,
) {
  const response = await fetch(
    `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "template",
        template: {
          name: SIGNATURE_OTP_TEMPLATE_NAME,
          language: { code: SIGNATURE_OTP_TEMPLATE_LANGUAGE },
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: code }],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [{ type: "text", text: code }],
            },
          ],
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
    error?: { code?: number; error_subcode?: number; type?: string };
  } | null;

  if (!response.ok || !payload?.messages?.[0]?.id) {
    console.warn("demo_signature_whatsapp_otp_send_failed", {
      status: response.status,
      metaErrorCode: payload?.error?.code ?? null,
      metaErrorSubcode: payload?.error?.error_subcode ?? null,
      metaErrorType: payload?.error?.type ?? null,
    });
    throw new Error("Não foi possível enviar o código pelo WhatsApp. Tente novamente.");
  }

  return { messageId: payload.messages[0].id };
}
