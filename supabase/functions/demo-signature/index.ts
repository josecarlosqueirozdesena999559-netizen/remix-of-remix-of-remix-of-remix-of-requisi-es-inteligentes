import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createRequestPdfBlob, type RequestPdfItem } from "./request-pdf.ts";
import { PDF_LOGO_DATA_URL } from "./pdf-assets.ts";
import {
  generateSixDigitOtp,
  hashSignatureOtp,
  maskWhatsAppPhoneNumber,
  normalizeWhatsAppPhoneNumber,
  sendWhatsAppAuthenticationOtp,
  SIGNATURE_OTP_TEMPLATE_NAME,
  SIGNATURE_OTP_TTL_SECONDS,
} from "./whatsapp-otp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DYELSSE_HOSPITAL_USER = "dyelssehospital";
const DYELSSE_HOSPITAL_NAME = "dyelsse larissa dos santos";
const HOSPITAL_SHARED_EMAIL = "hospital@usuarios.solicite.local";
const SIGNATURE_BUCKET = "demo-signature-private";
const REQUESTS_BUCKET = "requisicoes";
const MAX_PDF_BYTES = 14 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 700 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.solicitejapereiro.online",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AuthenticatedDemoUser = {
  id: string;
  email: string;
  profile: {
    id: string;
    auth_user_id: string | null;
    email: string;
    nome: string;
    usuario: string | null;
    setor: string | null;
    unidade_nome: string | null;
    cpf: string | null;
    whatsapp: string | null;
    is_admin: boolean;
  };
  claims: Record<string, unknown>;
  token: string;
};

type RequestRecord = {
  id: string;
  status: string;
  solicitante: string | null;
  solicitante_cpf: string | null;
  setor: string | null;
  categoria: string | null;
  programa: string | null;
  data: string | null;
  saida_vinculada_codigo?: string | null;
  saida_vinculada_data?: string | null;
  items: RequestPdfItem[] | null;
  saida_codigo: string | null;
  created_at: string;
  updated_at?: string | null;
  admin_attachment: unknown;
  signed_attachment: unknown;
};

type Attachment = {
  fileName?: string;
  storageBucket?: string;
  storagePath?: string;
  uploadedAt?: string;
  kind?: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  return jsonResponse({ ok: false, error: message }, status);
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}

function decodeJwtClaims(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Sessão inválida.");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return JSON.parse(decoded) as Record<string, unknown>;
}

async function requireDemoUser(request: Request): Promise<AuthenticatedDemoUser> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Sessão não autenticada.");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Edge Function sem configuração do Supabase.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user?.id || !authData.user.email) {
    throw new Error("Sessão expirada ou inválida.");
  }
  if (!safeEqual(authData.user.email.trim().toLowerCase(), HOSPITAL_SHARED_EMAIL)) {
    throw new Error(
      "A assinatura digital está disponível somente para a usuária Dyelsse do Hospital.",
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("usuarios")
    .select("id,auth_user_id,email,nome,usuario,setor,unidade_nome,cpf,whatsapp,is_admin")
    .eq("usuario", DYELSSE_HOSPITAL_USER)
    .ilike("nome", DYELSSE_HOSPITAL_NAME)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.is_admin ||
    profile.usuario?.trim().toLowerCase() !== DYELSSE_HOSPITAL_USER ||
    profile.nome?.trim().toLowerCase() !== DYELSSE_HOSPITAL_NAME ||
    profile.unidade_nome?.trim().toLowerCase() !== "hospital"
  ) {
    throw new Error(
      "O perfil Dyelsse do Hospital não está autorizado a usar a assinatura eletrônica.",
    );
  }

  return {
    id: authData.user.id,
    email: authData.user.email,
    profile,
    claims: decodeJwtClaims(token),
    token,
  };
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isOwnedByDemo(request: RequestRecord, profile: AuthenticatedDemoUser["profile"]) {
  const expectedLocation = profile.unidade_nome?.trim() || profile.setor?.trim() || "";
  return (
    normalize(request.solicitante) === normalize(profile.nome) &&
    normalize(request.setor) === normalize(expectedLocation) &&
    (!profile.cpf ||
      String(request.solicitante_cpf || "").replace(/\D/g, "") === profile.cpf.replace(/\D/g, ""))
  );
}

function decodePng(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("data:image/png;base64,")) {
    throw new Error("A assinatura deve ser uma imagem PNG.");
  }
  const base64 = value.slice("data:image/png;base64,".length).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("Imagem de assinatura inválida.");
  const binary = atob(base64);
  if (binary.length < 32 || binary.length > MAX_SIGNATURE_BYTES) {
    throw new Error("A imagem de assinatura ultrapassa o limite permitido.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new Error("A imagem de assinatura não é um PNG válido.");
  }
  return bytes;
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = getAttachment(value[index]);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.output && typeof record.output === "object") {
    const output = getAttachment(record.output);
    if (output) return output;
  }
  if (record.storageBucket === REQUESTS_BUCKET && typeof record.storagePath === "string") {
    return record as Attachment;
  }
  return null;
}

async function getRequestForDemo(requestId: string, user: AuthenticatedDemoUser) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Solicitação inválida.");
  const { data, error } = await admin
    .from("requisicoes")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) throw new Error("Solicitação não encontrada.");
  const request = data as RequestRecord;
  if (!isOwnedByDemo(request, user.profile))
    throw new Error("Você não está autorizado a assinar esta solicitação.");
  return request;
}

async function getOutputSourceUrl(user: AuthenticatedDemoUser, payload: Record<string, unknown>) {
  const requestId = String(payload.requestId || "");
  const document = await getRequestForDemo(requestId, user);
  if (isPendingStage(document.status) !== "output") {
    throw new Error("Esta solicitação não está aguardando assinatura de saída.");
  }

  const attachment = getAttachment(document.admin_attachment);
  if (!attachment?.storagePath) {
    throw new Error("O PDF de saída anexado não está disponível para visualização.");
  }

  const { data, error } = await admin.storage
    .from(REQUESTS_BUCKET)
    .createSignedUrl(attachment.storagePath, 5 * 60);
  if (error || !data?.signedUrl) {
    throw new Error("Não foi possível preparar a visualização segura do PDF de saída.");
  }

  return { ok: true, source_pdf_url: data.signedUrl, expires_in_seconds: 5 * 60 };
}

async function createCanonicalRequestPdf(
  request: RequestRecord,
  user: AuthenticatedDemoUser,
  stage: "request" | "output" = "request",
) {
  let program = request.programa?.trim() || "";
  if (!program && request.setor) {
    const { data: sector } = await admin
      .from("setores")
      .select("nome,programa")
      .eq("nome", request.setor)
      .maybeSingle();
    program = sector?.programa?.trim() || request.setor;
  }
  const pdf = await createRequestPdfBlob(
    {
      id: request.id,
      saida_codigo:
        stage === "output"
          ? request.saida_vinculada_codigo ||
            request.saida_codigo ||
            request.id.slice(0, 8).toUpperCase()
          : request.saida_codigo || request.id.slice(0, 8).toUpperCase(),
      documentStage: stage,
      outputCode:
        request.saida_vinculada_codigo ||
        request.saida_codigo ||
        request.id.slice(0, 8).toUpperCase(),
      requestCode: request.saida_codigo || request.id.slice(0, 8).toUpperCase(),
      outputDate: request.saida_vinculada_data || request.data,
      categoria: request.categoria,
      setor: request.setor,
      programa: program || request.setor || "-",
      solicitante: request.solicitante,
      solicitante_cpf: request.solicitante_cpf,
      solicitante_funcao: null,
      data: request.data,
      items: Array.isArray(request.items) ? request.items : [],
      requesterDisplayName: user.profile.nome || request.solicitante || "-",
      requesterDisplayCpf: user.profile.cpf || request.solicitante_cpf || "-",
      requesterDisplayRole: "Responsável pelo setor",
    },
    PDF_LOGO_DATA_URL,
  );
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  if (
    bytes.byteLength < 8 ||
    bytes.byteLength > MAX_PDF_BYTES ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new Error("Não foi possível gerar a versão oficial do PDF da solicitação.");
  }
  return bytes;
}

function isPendingStage(status: string) {
  if (status === "aguardando_assinatura_saida") return "output" as const;
  if (
    ["aguardando_assinatura", "aguardando_assinatura_requisicao", "correcao_requisicao"].includes(
      status,
    )
  ) {
    return "request" as const;
  }
  return null;
}

function getRequestCode(request: RequestRecord) {
  return request.saida_codigo?.trim() || request.id.slice(0, 8).toUpperCase();
}

function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

async function recordAudit(
  user: AuthenticatedDemoUser,
  eventType: string,
  request: Request,
  data: Record<string, unknown> = {},
  signatureRequestId: string | null = null,
) {
  const { error } = await admin.from("signature_audit_logs").insert({
    user_id: user.id,
    event_type: eventType,
    signature_request_id: signatureRequestId,
    ip_address: getClientIp(request),
    user_agent: request.headers.get("user-agent"),
    metadata: data,
  });
  if (error) {
    console.error("signature_audit_log_insert_failed", {
      eventType,
      signatureRequestId,
      code: error.code,
    });
  }
}

const SIGNATURE_ACTION_RATE_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  status: { limit: 30, windowSeconds: 60 },
  save_signature: { limit: 3, windowSeconds: 300 },
  begin_signature: { limit: 5, windowSeconds: 60 },
  preview_signature: { limit: 10, windowSeconds: 60 },
  confirm_preview: { limit: 10, windowSeconds: 60 },
  cancel_signature: { limit: 10, windowSeconds: 60 },
  send_signature_otp: { limit: 3, windowSeconds: 300 },
  complete_signature: { limit: 5, windowSeconds: 300 },
};

async function enforceSignatureRateLimit(userId: string, action: string) {
  const limits = SIGNATURE_ACTION_RATE_LIMITS[action];
  if (!limits) return;
  const { error } = await admin.rpc("consume_demo_signature_rate_limit", {
    p_user_id: userId,
    p_action: action,
    p_limit: limits.limit,
    p_window_seconds: limits.windowSeconds,
  });
  if (!error) return;
  if (error.message.includes("SIGNATURE_RATE_LIMITED")) {
    throw new Error("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.");
  }
  console.error("signature_rate_limit_check_failed", { action, code: error.code });
  throw new Error("Não foi possível validar a segurança desta etapa. Tente novamente.");
}

async function getVerifiedSignature(user: AuthenticatedDemoUser) {
  const { data, error } = await admin
    .from("demo_user_signatures")
    .select("user_id,profile_id,storage_key,signature_sha256,last_accepted_step,created_at")
    .eq("user_id", user.id)
    .eq("profile_id", user.profile.id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar sua assinatura cadastrada.");
  return data;
}

async function saveUserSignature(user: AuthenticatedDemoUser, request: Request, value: unknown) {
  const png = decodePng(value);
  const signatureHash = await sha256(png);
  const storageKey = `signatures/${user.id}/signature.png`;
  const existing = await getVerifiedSignature(user);
  if (existing) {
    if (existing.signature_sha256 === signatureHash) {
      return { ok: true, signature_saved: true };
    }
    throw new Error("Sua assinatura já está cadastrada. Solicite ao administrador a alteração.");
  }

  const { error: uploadError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(storageKey, png, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error("Não foi possível salvar sua assinatura manuscrita.");

  const { error: saveError } = await admin.from("demo_user_signatures").upsert(
    {
      user_id: user.id,
      profile_id: user.profile.id,
      storage_key: storageKey,
      signature_sha256: signatureHash,
      last_accepted_step: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (saveError) throw new Error("Não foi possível vincular a assinatura ao usuário autenticado.");

  await recordAudit(user, "SIGNATURE_SAVED", request, { signature_sha256: signatureHash });
  return { ok: true, signature_saved: true, signature_sha256: signatureHash };
}

async function getWhatsAppOtpConfig() {
  const { data, error } = await admin
    .from("app_settings")
    .select("key,value")
    .in("key", ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_API_VERSION"]);
  if (error) throw new Error("Não foi possível carregar a configuração do WhatsApp.");

  const settings = new Map(
    ((data ?? []) as Array<{ key: string; value: string }>).map((setting) => [
      setting.key,
      setting.value,
    ]),
  );
  const accessToken =
    settings.get("WHATSAPP_ACCESS_TOKEN")?.trim() || Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim();
  const phoneNumberId =
    settings.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() ||
    Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim();
  const graphApiVersion =
    settings.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    Deno.env.get("WHATSAPP_GRAPH_API_VERSION")?.trim() ||
    "v25.0";
  if (!accessToken || !phoneNumberId) {
    throw new Error("O envio por WhatsApp não está configurado.");
  }
  return { accessToken, phoneNumberId, graphApiVersion };
}

async function sendSignatureOtp(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const signatureRequestId = String(payload.signatureRequestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(signatureRequestId)) {
    throw new Error("Solicitação de assinatura inválida.");
  }
  const { data: intent, error: intentError } = await admin
    .from("demo_signature_requests")
    .select(
      "id,requisicao_id,document_stage,document_version,original_sha256,status,expires_at,preview_sha256,preview_reviewed_at",
    )
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    intentError ||
    !intent ||
    intent.status !== "pending" ||
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("A solicitação expirou. Reabra o documento para continuar.");
  }
  if (!intent.preview_reviewed_at || !/^[0-9a-f]{64}$/.test(intent.preview_sha256 || "")) {
    throw new Error("Confira e confirme a prévia do PDF antes de solicitar o código.");
  }

  const document = await getRequestForDemo(intent.requisicao_id, user);
  const expectedStage = isPendingStage(document.status);
  const currentVersion = `${document.updated_at || document.created_at}/${intent.original_sha256}`;
  if (
    !expectedStage ||
    expectedStage !== intent.document_stage ||
    currentVersion !== intent.document_version
  ) {
    throw new Error("O documento mudou. Reabra a solicitação para conferir a versão atual.");
  }

  const previewStorageKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  const { data: previewBlob, error: previewError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(previewStorageKey);
  if (previewError || !previewBlob) throw new Error("A prévia confirmada não está disponível.");
  const previewHash = await sha256(new Uint8Array(await previewBlob.arrayBuffer()));
  if (previewHash !== intent.preview_sha256) {
    throw new Error("A integridade da prévia não confere. Gere e confirme novamente.");
  }

  const profilePhone = user.profile.whatsapp?.trim();
  if (!profilePhone) throw new Error("Cadastre um WhatsApp no perfil do usuário antes de assinar.");
  const recipient = normalizeWhatsAppPhoneNumber(profilePhone);
  const phoneHint = maskWhatsAppPhoneNumber(recipient);
  const code = generateSixDigitOtp();
  const otpHash = await hashSignatureOtp(
    SUPABASE_SERVICE_ROLE_KEY,
    user.id,
    signatureRequestId,
    intent.preview_sha256,
    code,
  );
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + SIGNATURE_OTP_TTL_SECONDS * 1000);
  const { error: otpSaveError } = await admin.from("demo_signature_otps").upsert(
    {
      signature_request_id: signatureRequestId,
      user_id: user.id,
      preview_sha256: intent.preview_sha256,
      otp_hash: otpHash,
      attempt_count: 0,
      sent_at: sentAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      verified_at: null,
      consumed_at: null,
      created_at: sentAt.toISOString(),
    },
    { onConflict: "signature_request_id" },
  );
  if (otpSaveError) throw new Error("Não foi possível preparar o código da assinatura.");

  try {
    const config = await getWhatsAppOtpConfig();
    await sendWhatsAppAuthenticationOtp(config, recipient, code);
  } catch (sendError) {
    await admin
      .from("demo_signature_otps")
      .update({ otp_hash: null, attempt_count: 5 })
      .eq("signature_request_id", signatureRequestId)
      .eq("user_id", user.id);
    await recordAudit(
      user,
      "WHATSAPP_OTP_FAILED",
      request,
      { stage: "send", template: SIGNATURE_OTP_TEMPLATE_NAME },
      signatureRequestId,
    );
    throw sendError;
  }

  await recordAudit(
    user,
    "WHATSAPP_OTP_SENT",
    request,
    {
      channel: "whatsapp",
      template: SIGNATURE_OTP_TEMPLATE_NAME,
      phone_hint: phoneHint,
      preview_sha256: intent.preview_sha256,
      expires_at: expiresAt.toISOString(),
    },
    signatureRequestId,
  );
  return {
    ok: true,
    otp_sent: true,
    phone_hint: phoneHint,
    expires_at: expiresAt.toISOString(),
    valid_for_seconds: SIGNATURE_OTP_TTL_SECONDS,
  };
}

async function beginSignature(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const savedSignature = await getVerifiedSignature(user);
  if (!savedSignature) throw new Error("Cadastre primeiro sua assinatura manuscrita.");

  const requestId = String(payload.requestId || "");
  const document = await getRequestForDemo(requestId, user);
  const stage = isPendingStage(document.status);
  if (!stage) throw new Error("Esta solicitação não está aguardando assinatura.");

  let originalPdf: Uint8Array;
  if (stage === "output") {
    const attachment = getAttachment(document.admin_attachment);
    if (attachment) {
      if (
        !attachment.storagePath ||
        (attachment.storageBucket && attachment.storageBucket !== REQUESTS_BUCKET)
      ) {
        throw new Error("O PDF de saída anexado é inválido.");
      }
      const { data, error } = await admin.storage
        .from(REQUESTS_BUCKET)
        .download(attachment.storagePath);
      if (error || !data) throw new Error("Não foi possível carregar o PDF original da saída.");
      originalPdf = new Uint8Array(await data.arrayBuffer());
      if (
        originalPdf.byteLength > MAX_PDF_BYTES ||
        new TextDecoder().decode(originalPdf.slice(0, 5)) !== "%PDF-"
      ) {
        throw new Error("O PDF original é inválido ou maior que 14 MB.");
      }
    } else {
      originalPdf = await createCanonicalRequestPdf(document, user, "output");
    }
  } else {
    originalPdf = await createCanonicalRequestPdf(document, user);
  }

  const originalHash = await sha256(originalPdf);
  const intentId = crypto.randomUUID();
  const storageKey = `originals/${user.id}/${intentId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(storageKey, originalPdf, { contentType: "application/pdf", upsert: false });
  if (uploadError)
    throw new Error("Não foi possível preparar a versão exata do PDF para assinatura.");

  const createdAt = new Date().toISOString();
  const documentVersion = `${document.updated_at || document.created_at}/${originalHash}`;
  const { error: insertError } = await admin.from("demo_signature_requests").insert({
    id: intentId,
    user_id: user.id,
    requisicao_id: document.id,
    document_stage: stage,
    document_version: documentVersion,
    original_sha256: originalHash,
    original_storage_key: storageKey,
    status: "pending",
    consent_at: createdAt,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (insertError) {
    await admin.storage.from(SIGNATURE_BUCKET).remove([storageKey]);
    throw new Error("Não foi possível criar uma solicitação de assinatura de uso único.");
  }

  await recordAudit(
    user,
    "DOCUMENT_OPENED",
    request,
    {
      document_id: document.id,
      document_stage: stage,
      document_version: documentVersion,
      original_sha256: originalHash,
    },
    intentId,
  );
  await recordAudit(
    user,
    "SIGN_REQUESTED",
    request,
    {
      document_id: document.id,
      consent_at: createdAt,
    },
    intentId,
  );

  return {
    ok: true,
    signature_request_id: intentId,
    original_sha256: originalHash,
    document_id: document.id,
    document_code: getRequestCode(document),
    document_stage: stage,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

async function createEvidencePdf(
  original: Uint8Array,
  signaturePng: Uint8Array,
  input: {
    signedAt: string;
    preview?: boolean;
  },
) {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const image = await pdf.embedPng(signaturePng);
  const pages = pdf.getPages();
  const page = pages[pages.length - 1];
  if (!page) throw new Error("O PDF não contém páginas para assinatura.");

  // Alinha com o bloco do solicitante em src/lib/request-pdf.ts (A4, retrato).
  // O campo GOV.BR é apagado e substituído pela assinatura; a página não é ampliada.
  const mmToPt = 72 / 25.4;
  const pageSize = page.getSize();
  const expectedWidth = 210 * mmToPt;
  const expectedHeight = 297 * mmToPt;
  if (
    Math.abs(pageSize.width - expectedWidth) > 2 ||
    Math.abs(pageSize.height - expectedHeight) > 2
  ) {
    throw new Error("Este documento não usa o formato A4 esperado para o campo de assinatura.");
  }

  const pageWidth = page.getWidth();
  const signatureCenterX = 54 * mmToPt;
  const signatureBlockTop = 241;
  const signatureLineY = pageSize.height - (signatureBlockTop + 16) * mmToPt;
  const govBoxX = 16 * mmToPt;
  const govBoxY = pageSize.height - (signatureBlockTop + 12) * mmToPt;
  const govBoxWidth = 76 * mmToPt;
  const govBoxHeight = 12 * mmToPt;

  // Remove o quadro e seus dizeres GOV.BR, sem encobrir a linha nem os dados abaixo.
  page.drawRectangle({
    x: govBoxX - 1.2,
    y: govBoxY - 1,
    width: govBoxWidth + 2.4,
    height: govBoxHeight + 2,
    color: rgb(1, 1, 1),
  });

  const imageBox = { width: 72 * mmToPt, height: 17 * mmToPt };
  const imageSize = image.scaleToFit(imageBox.width, imageBox.height);
  page.drawImage(image, {
    x: signatureCenterX - imageSize.width / 2,
    y: signatureLineY,
    width: imageSize.width,
    height: imageSize.height,
  });

  // Reforça a linha existente do campo de assinatura para a rubrica ficar bem apoiada.
  page.drawLine({
    start: { x: signatureCenterX - 40 * mmToPt, y: signatureLineY },
    end: { x: signatureCenterX + 40 * mmToPt, y: signatureLineY },
    thickness: 0.7,
    color: rgb(0.35, 0.35, 0.35),
  });

  if (!input.preview) {
    const dateTime = `Assinado em ${new Intl.DateTimeFormat("pt-BR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Fortaleza",
      timeZoneName: "short",
    }).format(new Date(input.signedAt))}`;
    const dateFontSize = 7;
    const dateWidth = font.widthOfTextAtSize(dateTime, dateFontSize);
    const dateY = pageSize.height - (signatureBlockTop + 33) * mmToPt;
    page.drawText(dateTime, {
      x: Math.max(
        14 * mmToPt,
        Math.min(signatureCenterX - dateWidth / 2, pageWidth - 14 * mmToPt - dateWidth),
      ),
      y: dateY,
      size: dateFontSize,
      font,
      color: rgb(0.4, 0.43, 0.47),
    });
  }

  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

async function previewSignature(user: AuthenticatedDemoUser, payload: Record<string, unknown>) {
  const signatureRequestId = String(payload.signatureRequestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(signatureRequestId)) {
    throw new Error("Solicitação de assinatura inválida.");
  }

  const { data: intent, error: intentError } = await admin
    .from("demo_signature_requests")
    .select("*")
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    intentError ||
    !intent ||
    intent.status !== "pending" ||
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("A solicitação expirou. Reabra o documento para continuar.");
  }

  const signature = await getVerifiedSignature(user);
  if (!signature) throw new Error("Sua assinatura manuscrita não está cadastrada.");

  const { data: originalBlob, error: originalError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(intent.original_storage_key);
  if (originalError || !originalBlob) throw new Error("O PDF original não está disponível.");
  const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
  const originalHash = await sha256(originalBytes);
  if (originalHash !== intent.original_sha256) {
    throw new Error("A integridade do PDF original não confere.");
  }

  const { data: signatureBlob, error: signatureError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(signature.storage_key);
  if (signatureError || !signatureBlob) {
    throw new Error("A imagem da assinatura cadastrada não está disponível.");
  }
  const signatureBytes = new Uint8Array(await signatureBlob.arrayBuffer());
  if ((await sha256(signatureBytes)) !== signature.signature_sha256) {
    throw new Error("A integridade da assinatura manuscrita não confere.");
  }

  const document = await getRequestForDemo(intent.requisicao_id, user);
  const expectedStage = isPendingStage(document.status);
  const currentVersion = `${document.updated_at || document.created_at}/${originalHash}`;
  if (
    !expectedStage ||
    expectedStage !== intent.document_stage ||
    currentVersion !== intent.document_version
  ) {
    throw new Error("O documento mudou. Reabra a solicitação para conferir a versão atual.");
  }

  const previewBytes = await createEvidencePdf(originalBytes, signatureBytes, {
    signedAt: new Date().toISOString(),
    preview: true,
  });
  const previewStorageKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  const { error: uploadError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(previewStorageKey, previewBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw new Error("Não foi possível gerar a prévia do PDF assinado.");

  const previewHash = await sha256(previewBytes);
  const { data: previewIntent, error: previewHashError } = await admin
    .from("demo_signature_requests")
    .update({ preview_sha256: previewHash, preview_reviewed_at: null })
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (previewHashError || !previewIntent) {
    await admin.storage.from(SIGNATURE_BUCKET).remove([previewStorageKey]);
    throw new Error("Não foi possível vincular a prévia à solicitação de assinatura.");
  }

  const { data: signedPreview, error: signedUrlError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .createSignedUrl(previewStorageKey, 600);
  if (signedUrlError || !signedPreview?.signedUrl) {
    await admin.storage.from(SIGNATURE_BUCKET).remove([previewStorageKey]);
    throw new Error("Não foi possível abrir a prévia privada do PDF.");
  }
  return {
    ok: true,
    preview_url: signedPreview.signedUrl,
    expires_in: 600,
  };
}

async function confirmPreview(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const signatureRequestId = String(payload.signatureRequestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(signatureRequestId)) {
    throw new Error("Solicitação de assinatura inválida.");
  }

  const { data: intent, error: intentError } = await admin
    .from("demo_signature_requests")
    .select(
      "id,requisicao_id,document_stage,document_version,original_sha256,status,expires_at,preview_sha256,preview_reviewed_at",
    )
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    intentError ||
    !intent ||
    intent.status !== "pending" ||
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("A solicitação expirou. Reabra o documento para continuar.");
  }
  if (!/^[0-9a-f]{64}$/.test(intent.preview_sha256 || "")) {
    throw new Error("A prévia da assinatura não está pronta. Gere-a novamente.");
  }

  const document = await getRequestForDemo(intent.requisicao_id, user);
  const expectedStage = isPendingStage(document.status);
  const currentVersion = `${document.updated_at || document.created_at}/${intent.original_sha256}`;
  if (
    !expectedStage ||
    expectedStage !== intent.document_stage ||
    currentVersion !== intent.document_version
  ) {
    throw new Error("O documento mudou. Reabra a solicitação para conferir a versão atual.");
  }

  const previewStorageKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  const { data: previewBlob, error: previewError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(previewStorageKey);
  if (previewError || !previewBlob) throw new Error("A prévia privada não está disponível.");
  const previewHash = await sha256(new Uint8Array(await previewBlob.arrayBuffer()));
  if (previewHash !== intent.preview_sha256) {
    throw new Error("A integridade da prévia não confere. Gere a prévia novamente.");
  }

  const { data: confirmation, error: confirmationError } = await admin.rpc(
    "confirm_demo_signature_preview",
    {
      p_signature_request_id: signatureRequestId,
      p_user_id: user.id,
      p_preview_sha256: previewHash,
      p_ip_address: getClientIp(request),
      p_user_agent: request.headers.get("user-agent"),
    },
  );
  if (confirmationError || !confirmation?.ok) {
    throw new Error("Não foi possível registrar a revisão da prévia. Tente novamente.");
  }
  return { ok: true, preview_confirmed: true };
}

async function cancelSignature(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const signatureRequestId = String(payload.signatureRequestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(signatureRequestId)) {
    throw new Error("Solicitação de assinatura inválida.");
  }

  const { data: intent, error: intentError } = await admin
    .from("demo_signature_requests")
    .select("id,requisicao_id,original_storage_key,status")
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (intentError) throw new Error("Não foi possível cancelar a solicitação pendente.");
  if (!intent || intent.status !== "pending") return { ok: true, cancelled: false };

  const { error: updateError } = await admin
    .from("demo_signature_requests")
    .update({ status: "expired" })
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (updateError) throw new Error("Não foi possível cancelar a solicitação pendente.");

  const { error: otpInvalidateError } = await admin
    .from("demo_signature_otps")
    .update({ otp_hash: null })
    .eq("signature_request_id", signatureRequestId)
    .eq("user_id", user.id)
    .is("consumed_at", null);
  const previewStorageKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  await admin.storage
    .from(SIGNATURE_BUCKET)
    .remove([intent.original_storage_key, previewStorageKey]);
  if (otpInvalidateError) {
    console.error("signature_otp_invalidation_failed", { signatureRequestId });
  }
  await recordAudit(
    user,
    "SIGN_CANCELLED",
    request,
    { document_id: intent.requisicao_id, reason: "user_cancelled" },
    signatureRequestId,
  );
  return { ok: true, cancelled: true };
}

async function cleanupExpiredIntents(userId: string) {
  const { data: expired, error: queryError } = await admin
    .from("demo_signature_requests")
    .select("id,original_storage_key")
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .limit(50);
  if (queryError || !expired?.length) return;

  const ids = expired.map((intent) => intent.id);
  const { error: updateError } = await admin
    .from("demo_signature_requests")
    .update({ status: "expired" })
    .in("id", ids)
    .eq("user_id", userId)
    .eq("status", "pending");
  const { error: otpInvalidateError } = await admin
    .from("demo_signature_otps")
    .update({ otp_hash: null })
    .in("signature_request_id", ids)
    .is("consumed_at", null);
  const paths = expired.flatMap((intent) => [
    intent.original_storage_key,
    `previews/${userId}/${intent.id}.pdf`,
  ]);
  const { error: removeError } = await admin.storage.from(SIGNATURE_BUCKET).remove(paths);
  if (updateError || removeError || otpInvalidateError) {
    console.warn("Falha ao limpar artefatos expirados de assinatura.");
  }
}

async function completeSignature(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const signatureRequestId = String(payload.signatureRequestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(signatureRequestId))
    throw new Error("Solicitação de assinatura inválida.");

  const { data: intent, error: intentError } = await admin
    .from("demo_signature_requests")
    .select("*")
    .eq("id", signatureRequestId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    intentError ||
    !intent ||
    intent.status !== "pending" ||
    new Date(intent.expires_at).getTime() <= Date.now()
  ) {
    throw new Error("A solicitação de assinatura expirou ou já foi utilizada. Inicie novamente.");
  }

  if (!intent.preview_reviewed_at || !/^[0-9a-f]{64}$/.test(intent.preview_sha256 || "")) {
    throw new Error("Confira e confirme a prévia do PDF antes de inserir o código autenticador.");
  }
  const confirmedPreviewKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  const { data: confirmedPreview, error: confirmedPreviewError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(confirmedPreviewKey);
  if (confirmedPreviewError || !confirmedPreview) {
    throw new Error("A prévia confirmada não está mais disponível. Gere-a novamente.");
  }
  const confirmedPreviewHash = await sha256(new Uint8Array(await confirmedPreview.arrayBuffer()));
  if (confirmedPreviewHash !== intent.preview_sha256) {
    throw new Error("A prévia foi alterada. Gere e confirme a versão atual novamente.");
  }

  const code = String(payload.code || "").trim();
  if (!/^\d{6}$/.test(code))
    throw new Error("Digite o código de seis dígitos recebido no WhatsApp.");
  const otpHash = await hashSignatureOtp(
    SUPABASE_SERVICE_ROLE_KEY,
    user.id,
    signatureRequestId,
    intent.preview_sha256,
    code,
  );
  const { data: otpVerification, error: otpVerificationError } = await admin.rpc(
    "verify_demo_signature_otp",
    {
      p_signature_request_id: signatureRequestId,
      p_user_id: user.id,
      p_preview_sha256: intent.preview_sha256,
      p_otp_hash: otpHash,
    },
  );
  if (otpVerificationError) {
    console.error("signature_whatsapp_otp_check_failed", { code: otpVerificationError.code });
    throw new Error("Não foi possível validar o código. Tente novamente.");
  }
  if (!otpVerification?.ok) {
    await recordAudit(
      user,
      "WHATSAPP_OTP_FAILED",
      request,
      { stage: "verify" },
      signatureRequestId,
    );
    throw new Error("Código incorreto, expirado ou já utilizado. Solicite um novo código.");
  }

  const signature = await getVerifiedSignature(user);
  if (!signature) throw new Error("Sua assinatura manuscrita não está cadastrada.");

  const { data: originalBlob, error: originalError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(intent.original_storage_key);
  if (originalError || !originalBlob)
    throw new Error("A versão original do PDF não está disponível.");
  const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());
  const originalHash = await sha256(originalBytes);
  if (originalHash !== intent.original_sha256)
    throw new Error("A integridade do PDF original não confere.");

  const { data: signatureBlob, error: signatureError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .download(signature.storage_key);
  if (signatureError || !signatureBlob)
    throw new Error("A imagem da assinatura cadastrada não está disponível.");
  const signatureBytes = new Uint8Array(await signatureBlob.arrayBuffer());
  if ((await sha256(signatureBytes)) !== signature.signature_sha256) {
    throw new Error("A integridade da assinatura manuscrita não confere.");
  }

  const document = await getRequestForDemo(intent.requisicao_id, user);
  const expectedStage = isPendingStage(document.status);
  const currentVersion = `${document.updated_at || document.created_at}/${originalHash}`;
  if (
    !expectedStage ||
    expectedStage !== intent.document_stage ||
    currentVersion !== intent.document_version
  ) {
    throw new Error("A etapa do documento mudou. Reabra a solicitação e confirme novamente.");
  }
  const signedAt = new Date().toISOString();
  const signedBytes = await createEvidencePdf(originalBytes, signatureBytes, {
    signedAt,
  });
  const finalHash = await sha256(signedBytes);
  const safeDate = Date.now();
  const signedStorageKey = `requisicoes-assinadas/${document.id}/${safeDate}-${signatureRequestId}-assinado.pdf`;
  const { error: uploadError } = await admin.storage
    .from(REQUESTS_BUCKET)
    .upload(signedStorageKey, signedBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("Não foi possível salvar o PDF assinado.");

  const { data: completion, error: rpcError } = await admin.rpc(
    "complete_demo_signature_with_otp",
    {
      p_signature_request_id: signatureRequestId,
      p_user_id: user.id,
      p_otp_hash: otpHash,
      p_signed_storage_key: signedStorageKey,
      p_final_sha256: finalHash,
      p_signed_at: signedAt,
      p_ip_address: getClientIp(request),
      p_session_id: typeof user.claims.session_id === "string" ? user.claims.session_id : null,
      p_user_agent: request.headers.get("user-agent"),
    },
  );
  if (rpcError) {
    await admin.storage.from(REQUESTS_BUCKET).remove([signedStorageKey]);
    if (rpcError.message.includes("WHATSAPP_OTP_")) {
      throw new Error("Código expirado ou já utilizado. Solicite um novo código do WhatsApp.");
    }
    console.error("signature_completion_failed", { code: rpcError.code });
    throw new Error(
      "Não foi possível concluir a assinatura. Confira a solicitação e tente novamente.",
    );
  }

  await admin.storage
    .from(SIGNATURE_BUCKET)
    .remove([`previews/${user.id}/${signatureRequestId}.pdf`]);
  return completion;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return errorResponse(new Error("Método não permitido."), 405);

  try {
    const user = await requireDemoUser(request);
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(payload.action || "");
    const rateLimitAction = action === "get_output_source_url" ? "status" : action;
    await enforceSignatureRateLimit(user.id, rateLimitAction);

    if (action === "status") {
      await cleanupExpiredIntents(user.id);
      const signature = await getVerifiedSignature(user);
      return jsonResponse({
        ok: true,
        signature_saved: Boolean(signature),
        signature_created_at: signature?.created_at ?? null,
      });
    }

    if (action === "save_signature") {
      return jsonResponse(await saveUserSignature(user, request, payload.signaturePng));
    }

    if (action === "begin_signature") {
      return jsonResponse(await beginSignature(user, request, payload));
    }

    if (action === "get_output_source_url") {
      return jsonResponse(await getOutputSourceUrl(user, payload));
    }

    if (action === "preview_signature") {
      return jsonResponse(await previewSignature(user, payload));
    }

    if (action === "confirm_preview") {
      return jsonResponse(await confirmPreview(user, request, payload));
    }

    if (action === "send_signature_otp") {
      return jsonResponse(await sendSignatureOtp(user, request, payload));
    }

    if (action === "cancel_signature") {
      return jsonResponse(await cancelSignature(user, request, payload));
    }

    if (action === "complete_signature") {
      return jsonResponse(await completeSignature(user, request, payload));
    }

    return errorResponse(new Error("Ação de assinatura não reconhecida."), 400);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao processar a assinatura.";
    const status = /Sessão|autenticad|liberado somente|autorizado|corresponde/i.test(message)
      ? 403
      : 400;
    return errorResponse(error, status);
  }
});
