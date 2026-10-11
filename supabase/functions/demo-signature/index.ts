import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createRequestPdfBlob, type RequestPdfItem } from "./request-pdf.ts";
import { PDF_LOGO_DATA_URL } from "./pdf-assets.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEMO_PROFILE_ID = "34708484-8caa-456b-a423-9f91aeba52d8";
const DEMO_EMAIL = "demo.assinatura@usuarios.solicite.local";
const SIGNATURE_BUCKET = "demo-signature-private";
const REQUESTS_BUCKET = "requisicoes";
const MAX_PDF_BYTES = 14 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 700 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type AuthenticatedDemoUser = {
  id: string;
  email: string;
  profile: {
    id: string;
    auth_user_id: string;
    email: string;
    nome: string;
    usuario: string | null;
    setor: string | null;
    unidade_nome: string | null;
    cpf: string | null;
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
  if (!safeEqual(authData.user.email.trim().toLowerCase(), DEMO_EMAIL)) {
    throw new Error("Você não está autorizado a usar a assinatura eletrônica.");
  }

  const { data: profile, error: profileError } = await admin
    .from("usuarios")
    .select("id,auth_user_id,email,nome,usuario,setor,unidade_nome,cpf,is_admin")
    .eq("id", DEMO_PROFILE_ID)
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile ||
    profile.is_admin ||
    profile.email?.trim().toLowerCase() !== DEMO_EMAIL
  ) {
    throw new Error("O perfil autenticado não está autorizado a usar a assinatura eletrônica.");
  }

  return {
    id: authData.user.id,
    email: authData.user.email,
    profile,
    claims: decodeJwtClaims(token),
    token,
  };
}

function requireFreshTotp(user: AuthenticatedDemoUser, createdAt?: string) {
  const claims = user.claims;
  if (claims.aal !== "aal2") throw new Error("Confirme sua identidade com o Google Authenticator.");

  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const totpEntries = amr
    .filter((entry) => entry && typeof entry === "object")
    .filter((entry) => (entry as Record<string, unknown>).method === "totp") as Array<{
    method: string;
    timestamp?: number;
  }>;
  const latestTotp = totpEntries
    .map((entry) => Number(entry.timestamp || 0))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => right - left)[0];
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!latestTotp || latestTotp > nowSeconds + 30 || nowSeconds - latestTotp > 120) {
    throw new Error(
      "Faça uma nova confirmação pelo Google Authenticator para assinar este documento.",
    );
  }
  if (createdAt && latestTotp * 1000 < new Date(createdAt).getTime() - 5000) {
    throw new Error(
      "O código foi confirmado antes desta solicitação. Gere um novo código e tente novamente.",
    );
  }
  return {
    verifiedAt: new Date(latestTotp * 1000).toISOString(),
    step: Math.floor(latestTotp / 30),
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

async function createCanonicalRequestPdf(request: RequestRecord, user: AuthenticatedDemoUser) {
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
      saida_codigo: request.saida_codigo,
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
  totp_enabled: { limit: 5, windowSeconds: 300 },
  begin_signature: { limit: 5, windowSeconds: 60 },
  preview_signature: { limit: 10, windowSeconds: 60 },
  confirm_preview: { limit: 10, windowSeconds: 60 },
  cancel_signature: { limit: 10, windowSeconds: 60 },
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

async function getVerifiedSignature(userId: string) {
  const { data, error } = await admin
    .from("demo_user_signatures")
    .select("user_id,profile_id,storage_key,signature_sha256,last_accepted_step,created_at")
    .eq("user_id", userId)
    .eq("profile_id", DEMO_PROFILE_ID)
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar sua assinatura cadastrada.");
  return data;
}

async function saveUserSignature(user: AuthenticatedDemoUser, request: Request, value: unknown) {
  const png = decodePng(value);
  const signatureHash = await sha256(png);
  const storageKey = `signatures/${user.id}/signature.png`;
  const existing = await getVerifiedSignature(user.id);
  if (existing) requireFreshTotp(user);

  const { error: uploadError } = await admin.storage
    .from(SIGNATURE_BUCKET)
    .upload(storageKey, png, { contentType: "image/png", upsert: true });
  if (uploadError) throw new Error("Não foi possível salvar sua assinatura manuscrita.");

  const { error: saveError } = await admin.from("demo_user_signatures").upsert(
    {
      user_id: user.id,
      profile_id: DEMO_PROFILE_ID,
      storage_key: storageKey,
      signature_sha256: signatureHash,
      last_accepted_step: existing?.last_accepted_step ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (saveError) throw new Error("Não foi possível vincular a assinatura ao usuário autenticado.");

  await recordAudit(user, "SIGNATURE_SAVED", request, { signature_sha256: signatureHash });
  return { ok: true, signature_saved: true, signature_sha256: signatureHash };
}

async function recordTotpEnabled(user: AuthenticatedDemoUser, request: Request) {
  const totp = requireFreshTotp(user);
  const { error: stepError } = await admin
    .from("demo_user_signatures")
    .update({ last_accepted_step: totp.step, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("profile_id", DEMO_PROFILE_ID)
    .lt("last_accepted_step", totp.step);
  if (stepError) throw new Error("Não foi possível registrar a ativação do autenticador.");
  await recordAudit(user, "TOTP_ENABLED", request, {
    method: "totp",
    verified_at: totp.verifiedAt,
  });
  return { ok: true, totp_enabled: true };
}

async function beginSignature(
  user: AuthenticatedDemoUser,
  request: Request,
  payload: Record<string, unknown>,
) {
  const savedSignature = await getVerifiedSignature(user.id);
  if (!savedSignature) throw new Error("Cadastre primeiro sua assinatura manuscrita.");

  const requestId = String(payload.requestId || "");
  const document = await getRequestForDemo(requestId, user);
  const stage = isPendingStage(document.status);
  if (!stage) throw new Error("Esta solicitação não está aguardando assinatura.");

  let originalPdf: Uint8Array;
  if (stage === "output") {
    const attachment = getAttachment(document.admin_attachment);
    if (
      !attachment?.storagePath ||
      (attachment.storageBucket && attachment.storageBucket !== REQUESTS_BUCKET)
    ) {
      throw new Error("O PDF de saída aguardando assinatura não foi encontrado.");
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

  const signature = await getVerifiedSignature(user.id);
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

  const previewStorageKey = `previews/${user.id}/${signatureRequestId}.pdf`;
  await admin.storage
    .from(SIGNATURE_BUCKET)
    .remove([intent.original_storage_key, previewStorageKey]);
  await recordAudit(
    user,
    "SIGN_CANCELLED",
    request,
    { document_id: intent.requisicao_id, reason: "user_cancelled_before_totp" },
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
  const paths = expired.flatMap((intent) => [
    intent.original_storage_key,
    `previews/${userId}/${intent.id}.pdf`,
  ]);
  const { error: removeError } = await admin.storage.from(SIGNATURE_BUCKET).remove(paths);
  if (updateError || removeError) console.warn("Falha ao limpar prévias expiradas de assinatura.");
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

  const totp = requireFreshTotp(user, intent.created_at);
  const signature = await getVerifiedSignature(user.id);
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

  const { data: completion, error: rpcError } = await admin.rpc("complete_demo_signature", {
    p_signature_request_id: signatureRequestId,
    p_user_id: user.id,
    p_totp_step: totp.step,
    p_totp_verified_at: totp.verifiedAt,
    p_signed_storage_key: signedStorageKey,
    p_final_sha256: finalHash,
    p_signed_at: signedAt,
    p_ip_address: getClientIp(request),
    p_session_id: typeof user.claims.session_id === "string" ? user.claims.session_id : null,
    p_user_agent: request.headers.get("user-agent"),
  });
  if (rpcError) {
    await admin.storage.from(REQUESTS_BUCKET).remove([signedStorageKey]);
    if (rpcError.message.includes("TOTP_STEP_ALREADY_USED")) {
      throw new Error(
        "Este código já foi utilizado. Aguarde o próximo código do aplicativo autenticador.",
      );
    }
    throw new Error(rpcError.message || "Não foi possível concluir a assinatura.");
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
    await enforceSignatureRateLimit(user.id, action);

    if (action === "status") {
      await cleanupExpiredIntents(user.id);
      const signature = await getVerifiedSignature(user.id);
      return jsonResponse({
        ok: true,
        signature_saved: Boolean(signature),
        signature_created_at: signature?.created_at ?? null,
      });
    }

    if (action === "save_signature") {
      return jsonResponse(await saveUserSignature(user, request, payload.signaturePng));
    }

    if (action === "totp_enabled") {
      return jsonResponse(await recordTotpEnabled(user, request));
    }

    if (action === "begin_signature") {
      return jsonResponse(await beginSignature(user, request, payload));
    }

    if (action === "preview_signature") {
      return jsonResponse(await previewSignature(user, payload));
    }

    if (action === "confirm_preview") {
      return jsonResponse(await confirmPreview(user, request, payload));
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
