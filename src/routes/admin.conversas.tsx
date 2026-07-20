import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Check,
  Loader2,
  MessageCircle,
  MessageSquareMore,
  Mic,
  Paperclip,
  Send,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { resolveAttachmentUrl, type AttachmentFile } from "@/lib/attachments";
import { getWhatsAppAdminNumbers } from "@/lib/app-settings-actions";
import { requestNeedsSignature } from "@/lib/pending-request-signatures";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/conversas")({
  validateSearch: (search: Record<string, unknown>) => ({
    phone: typeof search.phone === "string" ? search.phone : "",
  }),
  component: ConversasPage,
});

type IncomingMessage = {
  message_id: string;
  sender_id: string | null;
  body: string | null;
  message_type: string | null;
  occurred_at: string | null;
  created_at: string;
  raw_payload?: {
    type?: string | null;
    reaction?: {
      emoji?: string | null;
    } | null;
    stored_media?: AttachmentFile | null;
  } | null;
};

type OutgoingMessage = {
  message_id: string;
  recipient_id: string | null;
  body: string | null;
  message_type: string | null;
  occurred_at: string | null;
  created_at: string;
  raw_payload?: {
    source?: string | null;
    audience?: string | null;
    notificationType?: string | null;
    adminName?: string | null;
    adminEmail?: string | null;
    stored_media?: AttachmentFile | null;
    sentBy?: {
      name?: string | null;
      email?: string | null;
    } | null;
  } | null;
};

type OutgoingStatusRow = {
  message_id: string;
  recipient_id: string | null;
  status: string;
  occurred_at: string | null;
  created_at: string;
};

type UserRow = {
  nome: string | null;
  whatsapp: string | null;
  cpf?: string | null;
  setor?: string | null;
  unidade_nome?: string | null;
  is_admin?: boolean | null;
  role?: string | null;
};

type UserSessionRow = {
  key: string;
  value: string | null;
};

type ConversationMessage = {
  id: string;
  phone: string;
  body: string;
  messageType: string;
  occurredAt: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
  senderName?: string | null;
  status?: "sending" | "failed" | "sent" | "delivered" | "read";
  mediaAttachment?: AttachmentFile | null;
};

type ConversationSummary = {
  phone: string;
  displayName: string;
  hasRegisteredUser: boolean;
  preview: string;
  lastAt: string;
  lastIncomingAt: string | null;
  isWindowOpen: boolean;
  messages: ConversationMessage[];
};

type StandardMessagePreset = {
  id: string;
  label: string;
  description: string;
  buildMessage?: (userName: string) => string;
  action?: "charge-pending-signatures";
};

const CONVERSATION_INCOMING_LIMIT = 3000;
const CONVERSATION_OUTGOING_LIMIT = 3000;
const CONVERSATION_STATUS_LIMIT = 5000;

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || "";
}

async function getFunctionInvokeErrorMessage(error: unknown, fallback?: string | null) {
  if (fallback?.trim()) return fallback.trim();

  const maybeError = error as
    | {
        message?: string;
        context?: {
          json?: () => Promise<unknown>;
          text?: () => Promise<string>;
        };
      }
    | null
    | undefined;

  if (typeof maybeError?.context?.json === "function") {
    try {
      const payload = await maybeError.context.json();
      if (payload && typeof payload === "object" && "error" in payload) {
        const message = String((payload as { error?: unknown }).error || "").trim();
        if (message) return message;
      }
    } catch {
      // ignore JSON parse failures from function responses
    }
  }

  if (typeof maybeError?.context?.text === "function") {
    try {
      const text = (await maybeError.context.text())?.trim();
      if (text) return text;
    } catch {
      // ignore raw text read failures from function responses
    }
  }

  return maybeError?.message?.trim() || "Erro ao enviar mensagem.";
}

function canonicalConversationPhone(value: string | null | undefined) {
  const digits = normalizePhone(value);
  if (!digits) return "";

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55") && digits.length === 12) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }

  return digits;
}

function getPhoneVariants(phone: string) {
  const digits = canonicalConversationPhone(phone);
  if (!digits) return [];

  const variants = new Set<string>([digits]);

  if (digits.startsWith("55") && digits.length === 13 && digits[4] === "9") {
    variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }

  if (digits.startsWith("55") && digits.length === 12) {
    variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }

  return [...variants];
}

function phonesMatch(left: string, right: string) {
  const leftVariants = getPhoneVariants(left);
  const rightVariants = getPhoneVariants(right);
  return leftVariants.some((value) => rightVariants.includes(value));
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.length === 12 && digits.startsWith("55")) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return new Intl.DateTimeFormat("pt-BR", {
    ...(isSameDay ? { timeStyle: "short" as const } : { dateStyle: "short" as const }),
  }).format(date);
}

function isWhatsAppWindowOpen(value: string | null) {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed > Date.now() - 24 * 60 * 60 * 1000;
}

function getMessageSortTime(message: Pick<ConversationMessage, "occurredAt" | "createdAt">) {
  const created = Date.parse(message.createdAt);
  if (Number.isFinite(created)) return created;

  const occurred = Date.parse(message.occurredAt);
  return Number.isFinite(occurred) ? occurred : 0;
}

function getOutgoingSenderName(message: OutgoingMessage) {
  return (
    message.raw_payload?.sentBy?.name?.trim() ||
    message.raw_payload?.adminName?.trim() ||
    message.raw_payload?.sentBy?.email?.trim() ||
    message.raw_payload?.adminEmail?.trim() ||
    "Admin"
  );
}

function resolveConversationUser(phone: string, users: UserRow[]) {
  const exactMatch = users.find((user) => canonicalConversationPhone(user.whatsapp) === phone);
  if (exactMatch?.nome?.trim()) return exactMatch;

  const variantMatches = users.filter((user) => phonesMatch(user.whatsapp || "", phone));
  if (variantMatches.length === 1 && variantMatches[0]?.nome?.trim()) {
    return variantMatches[0];
  }

  return null;
}

function isAdminUser(user: UserRow | null | undefined) {
  if (!user) return false;
  return Boolean(user.is_admin) || user.role === "admin";
}

function isAdminPhone(phone: string, users: UserRow[], adminNumbers: string[] = []) {
  if (adminNumbers.some((adminNumber) => phonesMatch(adminNumber, phone))) return true;

  const matchedUser = resolveConversationUser(phone, users);
  return isAdminUser(matchedUser);
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "??";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function getFirstName(name: string) {
  const firstName = name.trim().split(/\s+/).filter(Boolean)[0];
  return firstName || "usuario";
}

function getMessagePlaceholder(messageType: string, direction: "incoming" | "outgoing") {
  if (messageType === "audio") return direction === "incoming" ? "[audio recebido]" : "[audio enviado]";
  if (messageType === "image") return "[imagem]";
  if (messageType === "video") return direction === "incoming" ? "[video recebido]" : "[video enviado]";
  if (messageType === "reaction") return "[reacao]";
  return "[mensagem sem texto]";
}

function getMessageDisplayBody(
  message: Pick<ConversationMessage, "body" | "messageType" | "direction" | "senderName">,
) {
  const body = message.body?.trim();
  const baseBody = body || getMessagePlaceholder(message.messageType, message.direction);

  if (message.direction === "outgoing" && message.senderName?.trim()) {
    return `${message.senderName.trim()}: ${baseBody}`;
  }

  return baseBody;
}

function getIncomingMessageDisplayBody(message: IncomingMessage) {
  const body = message.body?.trim();
  if (body) return body;

  const reactionEmoji = message.raw_payload?.reaction?.emoji?.trim();
  if (reactionEmoji) return `Reagiu com ${reactionEmoji}`;

  const messageType = message.message_type?.trim() || message.raw_payload?.type?.trim() || "";
  return getMessagePlaceholder(messageType, "incoming");
}

function getOutgoingStatusLabel(status?: ConversationMessage["status"]) {
  if (status === "sending") return "Enviando...";
  if (status === "failed") return "Falhou ao enviar";
  if (status === "read") return "Lido";
  if (status === "delivered") return "Entregue";
  if (status === "sent") return "Enviado";
  return null;
}

function getMicrophoneAccessMessage(error: unknown) {
  const maybeError = error as { name?: string; message?: string } | null | undefined;
  const errorName = String(maybeError?.name || "").trim();
  const errorMessage = String(maybeError?.message || "").trim();

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "O acesso ao microfone foi bloqueado. Libere a permissao do site no navegador e tente novamente.";
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "Nenhum microfone foi encontrado neste dispositivo.";
  }

  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "O microfone esta em uso por outro aplicativo. Feche o outro app e tente novamente.";
  }

  if (errorName === "SecurityError") {
    return "O navegador bloqueou o microfone nesta pagina. Verifique as permissoes do site.";
  }

  if (errorMessage) return errorMessage;
  return "Nao foi possivel acessar o microfone.";
}

const STANDARD_MESSAGE_PRESETS: StandardMessagePreset[] = [
  {
    id: "cobrar-assinatura",
    label: "Cobrar assinatura",
    description: "Busca todas as assinaturas pendentes do usuário e monta uma cobrança profissional.",
    action: "charge-pending-signatures",
  },
  {
    id: "pedido-separado",
    label: "Pedido separado e aguardando assinaturas",
    description: "Avisa que o pedido esta separado e lembra sobre assinatura e retirada.",
    buildMessage: (userName) =>
      [
        `Ola, ${userName}.`,
        "Seu pedido [DIGITE AQUI MANUALMENTE] esta separado.",
        "Por gentileza, assine suas requisicoes e realize a retirada.",
        "Lembramos que os pedidos so sao entregues apos a conclusao de todas as assinaturas.",
        "Obrigado!",
      ].join(" "),
  },
];

type PendingSignatureReminderRequest = {
  id: string;
  saida_codigo: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  solicitante: string | null;
  solicitante_cpf: string | null;
  setor: string | null;
};

function getPendingSignatureLabel(status: string) {
  if (status === "aguardando_assinatura_saida") return "assinatura da saída";
  if (status === "correcao_requisicao") return "correção e reenvio da requisição";
  return "assinatura da requisição";
}

async function buildPendingSignatureChargeMessage(phone: string, users: UserRow[]) {
  const candidateUsers = users.filter(
    (user) => phonesMatch(user.whatsapp || "", phone) && !isAdminUser(user),
  );
  const matchedUser = resolveConversationUser(phone, candidateUsers) || candidateUsers[0] || null;

  if (!matchedUser || candidateUsers.length === 0) {
    throw new Error("Não foi possível identificar o usuário desta conversa para buscar as assinaturas pendentes.");
  }

  const nome = matchedUser.nome?.trim() || "usuario";
  const candidateCpfs = new Set(
    candidateUsers
      .map((user) => user.cpf?.trim() || "")
      .filter(Boolean),
  );
  const candidateIdentityKeys = new Set(
    candidateUsers
      .map((user) => {
        const candidateName = user.nome?.trim() || "";
        const candidateLocation = user.unidade_nome?.trim() || user.setor?.trim() || "";
        return candidateName && candidateLocation ? `${candidateName}::${candidateLocation}` : "";
      })
      .filter(Boolean),
  );

  const { data, error } = await supabase
    .from("requisicoes")
    .select("id,saida_codigo,data,created_at,status,signed_attachment,solicitante,solicitante_cpf,setor")
    .in("status", [
      "aguardando_assinatura",
      "aguardando_assinatura_requisicao",
      "aguardando_assinatura_saida",
      "correcao_requisicao",
    ])
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  if (candidateCpfs.size === 0 && candidateIdentityKeys.size === 0) {
    throw new Error("Este usuário não possui identificação suficiente para localizar as assinaturas pendentes.");
  }

  const pendingRequests = ((data ?? []) as PendingSignatureReminderRequest[]).filter((request) => {
    if (!requestNeedsSignature(request)) return false;

    const requestCpf = request.solicitante_cpf?.trim() || "";
    if (requestCpf && candidateCpfs.has(requestCpf)) return true;

    const requestName = request.solicitante?.trim() || "";
    const requestLocation = request.setor?.trim() || "";
    return Boolean(requestName && requestLocation) &&
      candidateIdentityKeys.has(`${requestName}::${requestLocation}`);
  });

  if (pendingRequests.length === 0) {
    return [
      `Olá, ${getFirstName(nome)}.`,
      "No momento não identificamos assinaturas pendentes vinculadas ao seu cadastro.",
      "Se precisar de apoio, ficamos à disposição.",
    ].join("\n\n");
  }

  const codeByRequestId = buildGlobalRequestCodes(pendingRequests);
  const requestLines = pendingRequests.map((request, index) => {
    const code = request.saida_codigo || codeByRequestId.get(request.id) || request.id;
    const requestDate = request.data?.trim() || "-";
    return `${index + 1}. ${code} (${requestDate}) - ${getPendingSignatureLabel(request.status)}.`;
  });

  return [
    `Olá, ${getFirstName(nome)}.`,
    "Identificamos pendências de assinatura em seu nome no sistema do almoxarifado.",
    "No momento constam os seguintes documentos aguardando regularização:",
    requestLines.join("\n"),
    "Por gentileza, acesse o sistema e conclua as assinaturas pendentes para dar continuidade ao atendimento da sua solicitação.",
    "Após a regularização das pendências, solicitamos que o motorista ou responsável compareça ao almoxarifado para retirada do material, conforme os procedimentos internos.",
    "Se alguma pendência já tiver sido regularizada, desconsidere esta mensagem.",
    "Ficamos à disposição.",
  ].join("\n\n");
}

function buildConversationSummaries(input: {
  incoming: IncomingMessage[];
  outgoing: OutgoingMessage[];
  outgoingStatuses?: Map<string, ConversationMessage["status"]>;
  optimisticMessages?: ConversationMessage[];
  userSessions?: Map<string, string>;
  adminSessions?: Map<string, string>;
  adminNumbers?: string[];
  users: UserRow[];
}) {
  const byPhone = new Map<string, ConversationMessage[]>();

  input.incoming.forEach((message) => {
    const phone = canonicalConversationPhone(message.sender_id);
    if (!phone) return;

    const next = byPhone.get(phone) || [];
    next.push({
      id: message.message_id,
      phone,
      body: getIncomingMessageDisplayBody(message),
      messageType: message.message_type?.trim() || "desconhecida",
      occurredAt: message.occurred_at || message.created_at,
      createdAt: message.created_at,
      direction: "incoming",
      mediaAttachment: message.raw_payload?.stored_media || null,
    });
    byPhone.set(phone, next);
  });

  input.outgoing.forEach((message) => {
    const phone = canonicalConversationPhone(message.recipient_id);
    if (!phone) return;

    const next = byPhone.get(phone) || [];
    next.push({
      id: message.message_id,
      phone,
      body: message.body?.trim() || "[mensagem sem texto]",
      messageType: message.message_type?.trim() || "text",
      occurredAt: message.occurred_at || message.created_at,
      createdAt: message.created_at,
      direction: "outgoing",
      senderName: getOutgoingSenderName(message),
      status: input.outgoingStatuses?.get(message.message_id),
      mediaAttachment: message.raw_payload?.stored_media || null,
    });
    byPhone.set(phone, next);
  });

  (input.optimisticMessages || []).forEach((message) => {
    const phone = canonicalConversationPhone(message.phone);
    if (!phone) return;

    const next = byPhone.get(phone) || [];
    next.push({ ...message, phone });
    byPhone.set(phone, next);
  });

  return [...byPhone.entries()]
    .filter(([phone]) => !isAdminPhone(phone, input.users, input.adminNumbers))
    .map(([phone, messages]) => {
      const matchedUser = resolveConversationUser(phone, input.users);
      const sortedMessages = [...messages].sort(
        (left, right) => getMessageSortTime(left) - getMessageSortTime(right),
      );
      const lastMessage = sortedMessages[sortedMessages.length - 1];
      const lastIncomingMessage =
        [...sortedMessages].reverse().find((message) => message.direction === "incoming") || null;

      const lastIncomingAt = lastIncomingMessage?.createdAt || lastIncomingMessage?.occurredAt || null;
      const sessionExpiresAt = input.userSessions?.get(phone) || null;
      const adminSessionExpiresAt = input.adminSessions?.get(phone) || null;
      const isAdminNumber = input.adminNumbers?.some((adminNumber) => phonesMatch(adminNumber, phone));
      const sessionOpen = Boolean(
        sessionExpiresAt &&
          Number.isFinite(Date.parse(sessionExpiresAt)) &&
          Date.parse(sessionExpiresAt) > Date.now(),
      );
      const adminSessionOpen = Boolean(
        isAdminNumber &&
          adminSessionExpiresAt &&
          Number.isFinite(Date.parse(adminSessionExpiresAt)) &&
          Date.parse(adminSessionExpiresAt) > Date.now(),
      );

      return {
        phone,
        displayName: matchedUser?.nome?.trim() || formatPhone(phone),
        hasRegisteredUser: Boolean(matchedUser) && !isAdminUser(matchedUser),
        preview: lastMessage ? getMessageDisplayBody(lastMessage) : "",
        lastAt: lastMessage?.createdAt || lastMessage?.occurredAt || new Date(0).toISOString(),
        lastIncomingAt,
        isWindowOpen: sessionOpen || adminSessionOpen || isWhatsAppWindowOpen(lastIncomingAt),
        messages: sortedMessages,
      } satisfies ConversationSummary;
    })
    .sort((left, right) => Date.parse(right.lastAt) - Date.parse(left.lastAt));
}

function ConversasPage() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingMessage[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const [outgoingStatuses, setOutgoingStatuses] = useState<Map<string, ConversationMessage["status"]>>(
    new Map(),
  );
  const [optimisticMessages, setOptimisticMessages] = useState<ConversationMessage[]>([]);
  const [userSessions, setUserSessions] = useState<Map<string, string>>(new Map());
  const [adminSessions, setAdminSessions] = useState<Map<string, string>>(new Map());
  const [adminNumbers, setAdminNumbers] = useState<string[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentAdminName, setCurrentAdminName] = useState("Admin");
  const [replyText, setReplyText] = useState("");
  const [messageMediaUrls, setMessageMediaUrls] = useState<Record<string, string>>({});
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const latestIncomingMessageIdsRef = useRef<Map<string, string>>(new Map());
  const notificationsBootstrappedRef = useRef(false);
  const notificationRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function fileToBase64(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",").pop() || "" : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo de audio."));
      reader.readAsDataURL(file);
    });
  }

  function stopRecordingTracks() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  }

  async function loadConversations() {
      setError(null);

      try {
      const { profile } = await getCurrentUserProfile();
      if (!profile?.is_admin) {
        setIncoming([]);
        setOutgoing([]);
        setUsers([]);
        return;
      }
      setCurrentAdminName(profile.nome?.trim() || "Admin");

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

      const adminNumbersResult = await getWhatsAppAdminNumbers({
        data: { accessToken },
      }).catch(() => ({ numbers: [] }));
      const nextAdminNumbers = Array.isArray((adminNumbersResult as any)?.numbers)
        ? (adminNumbersResult as any).numbers.map(String)
        : [];
      setAdminNumbers(nextAdminNumbers);

      const [incomingResult, outgoingResult, statusResult, usersResult, sessionsResult] = await Promise.all([
        (supabase as any)
          .from("whatsapp_webhook_message_audit")
          .select("message_id,sender_id,body,message_type,occurred_at,created_at,raw_payload")
          .not("sender_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(CONVERSATION_INCOMING_LIMIT),
        (supabase as any)
          .from("whatsapp_outbound_message_audit")
          .select("message_id,recipient_id,body,message_type,occurred_at,created_at,raw_payload")
          .not("recipient_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(CONVERSATION_OUTGOING_LIMIT),
        (supabase as any)
          .from("whatsapp_webhook_status_audit")
          .select("message_id,recipient_id,status,occurred_at,created_at")
          .order("created_at", { ascending: false })
          .limit(CONVERSATION_STATUS_LIMIT),
        supabase
          .from("usuarios")
          .select("nome,whatsapp,cpf,setor,unidade_nome,is_admin,role")
          .not("whatsapp", "is", null),
        (supabase as any)
          .from("app_settings")
          .select("key,value")
          .like("key", "WHATSAPP_%_SESSION_%"),
      ]);

      if (
        incomingResult.error ||
        outgoingResult.error ||
        statusResult.error ||
        usersResult.error ||
        sessionsResult.error
      ) {
        throw new Error(
          incomingResult.error?.message ||
            outgoingResult.error?.message ||
            statusResult.error?.message ||
            usersResult.error?.message ||
            sessionsResult.error?.message ||
            "Erro ao carregar conversas.",
        );
      }

      setIncoming(
        ((incomingResult.data ?? []) as IncomingMessage[]).filter(
          (message) =>
            !nextAdminNumbers.some((adminNumber) => phonesMatch(adminNumber, message.sender_id || "")),
        ),
      );
      setOutgoing(
        ((outgoingResult.data ?? []) as OutgoingMessage[]).filter(
          (message) =>
            !nextAdminNumbers.some((adminNumber) =>
              phonesMatch(adminNumber, message.recipient_id || ""),
            ),
        ),
      );
      setOutgoingStatuses(
        ((statusResult.data ?? []) as OutgoingStatusRow[]).reduce((statuses, row) => {
          const normalizedStatus = String(row.status || "").trim().toLowerCase();
          if (
            normalizedStatus === "sent" ||
            normalizedStatus === "delivered" ||
            normalizedStatus === "read" ||
            normalizedStatus === "failed"
          ) {
            statuses.set(row.message_id, normalizedStatus as ConversationMessage["status"]);
          }
          return statuses;
        }, new Map<string, ConversationMessage["status"]>()),
      );
      setUsers((usersResult.data ?? []) as UserRow[]);
      setUserSessions(
        ((sessionsResult.data ?? []) as UserSessionRow[]).reduce((sessions, row) => {
          const isAdminSession = row.key.startsWith("WHATSAPP_ADMIN_SESSION_");
          const rawPhone = row.key
            .replace("WHATSAPP_USER_SESSION_", "")
            .replace("WHATSAPP_ADMIN_SESSION_", "");
          const phone = canonicalConversationPhone(rawPhone);
          const value = row.value?.trim();
          if (phone && value && !isAdminSession) sessions.set(phone, value);
          return sessions;
        }, new Map<string, string>()),
      );
      setAdminSessions(
        ((sessionsResult.data ?? []) as UserSessionRow[]).reduce((sessions, row) => {
          if (!row.key.startsWith("WHATSAPP_ADMIN_SESSION_")) return sessions;
          const phone = canonicalConversationPhone(row.key.replace("WHATSAPP_ADMIN_SESSION_", ""));
          const value = row.value?.trim();
          if (phone && value) sessions.set(phone, value);
          return sessions;
        }, new Map<string, string>()),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar conversas.");
    }
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      await loadConversations();
      if (active) setLoading(false);
    }

    void boot();

    const channel = supabase
      .channel("admin-whatsapp-conversas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_webhook_message_audit" },
        () => void loadConversations(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_outbound_message_audit" },
        () => void loadConversations(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_webhook_status_audit" },
        () => void loadConversations(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        () => void loadConversations(),
      )
      .subscribe();

    const refreshInterval = window.setInterval(() => void loadConversations(), 8000);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, []);

  const conversations = useMemo(
    () =>
      buildConversationSummaries({
        incoming,
        outgoing,
        outgoingStatuses,
        optimisticMessages,
        userSessions,
        adminSessions,
        adminNumbers,
        users,
      }),
    [incoming, outgoing, outgoingStatuses, optimisticMessages, userSessions, adminSessions, adminNumbers, users],
  );
  const selectedPhone = canonicalConversationPhone(search.phone);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let active = true;

    async function registerNotificationWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/notification-sw.js");
        if (!active) return;
        notificationRegistrationRef.current = registration;
      } catch {
        notificationRegistrationRef.current = null;
      }
    }

    void registerNotificationWorker();

    return () => {
      active = false;
    };
  }, []);

  async function showIncomingMessageNotification(
    phone: string,
    title: string,
    body: string,
  ) {
    if (notificationPermission !== "granted" || typeof Notification === "undefined") return;

    const notificationUrl =
      typeof window === "undefined"
        ? `/admin/conversas?phone=${encodeURIComponent(phone)}`
        : `${window.location.origin}/admin/conversas?phone=${encodeURIComponent(phone)}`;

    try {
      if (notificationRegistrationRef.current) {
        await notificationRegistrationRef.current.showNotification(title, {
          body,
          tag: `whatsapp-${phone}`,
          renotify: true,
          data: {
            url: notificationUrl,
          },
        });
        return;
      }
    } catch {
      notificationRegistrationRef.current = null;
    }

    const notification = new Notification(title, {
      body,
      tag: `whatsapp-${phone}`,
    });

    notification.onclick = () => {
      window.focus();
      openConversation(phone);
      notification.close();
    };
  }

  useEffect(() => {
    if (!conversations.length) return;

    const latestIncomingByPhone = new Map<string, ConversationMessage>();
    conversations.forEach((conversation) => {
      const latestIncoming =
        [...conversation.messages].reverse().find((message) => message.direction === "incoming") || null;
      if (latestIncoming) latestIncomingByPhone.set(conversation.phone, latestIncoming);
    });

    if (!notificationsBootstrappedRef.current) {
      latestIncomingMessageIdsRef.current = new Map(
        [...latestIncomingByPhone.entries()].map(([phone, message]) => [phone, message.id]),
      );
      notificationsBootstrappedRef.current = true;
      return;
    }

    latestIncomingByPhone.forEach((message, phone) => {
      const previousMessageId = latestIncomingMessageIdsRef.current.get(phone);
      if (previousMessageId === message.id) return;

      latestIncomingMessageIdsRef.current.set(phone, message.id);

      const conversation = conversations.find((item) => item.phone === phone);
      void showIncomingMessageNotification(
        phone,
        conversation?.displayName || "Nova mensagem",
        getMessageDisplayBody(message),
      );
    });
  }, [conversations, notificationPermission]);

  useEffect(() => {
    if (
      selectedPhone &&
      !conversations.some((conversation) => conversation.phone === selectedPhone)
    ) {
      void navigate({
        to: "/admin/conversas",
        search: {},
        replace: true,
      });
    }
  }, [conversations, navigate, selectedPhone]);

  const selectedConversation =
    conversations.find((conversation) => conversation.phone === selectedPhone) || null;
  const selectedConversationFirstName = getFirstName(selectedConversation?.displayName || "");
  const replyLineCount = replyText ? replyText.split(/\r?\n/).length : 1;
  const hasLongReplyDraft = replyText.length > 140 || replyLineCount > 4;
  const slashQuery = replyText.trimStart().startsWith("/") ? replyText.trimStart().slice(1).toLowerCase() : "";
  const filteredStandardMessages = useMemo(
    () =>
      STANDARD_MESSAGE_PRESETS.filter((preset) => {
        if (!slashQuery) return true;
        const haystack = `${preset.label} ${preset.description}`.toLowerCase();
        return haystack.includes(slashQuery);
      }),
    [slashQuery],
  );
  const isSlashMenuOpen = selectedConversation?.isWindowOpen && replyText.trimStart().startsWith("/");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedConversation?.phone, selectedConversation?.messages.length]);

  useEffect(() => {
    const textarea = replyTextareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 220);
    textarea.style.height = `${Math.max(nextHeight, 44)}px`;
  }, [replyText]);

  useEffect(() => {
    let active = true;

    async function loadMediaUrls() {
      const mediaMessages = (selectedConversation?.messages || []).filter(
        (message) =>
          (message.messageType === "audio" ||
            message.messageType === "image" ||
            message.messageType === "video") &&
          message.mediaAttachment?.storageBucket &&
          message.mediaAttachment?.storagePath,
      );

      if (!mediaMessages.length) return;

      const resolvedEntries = await Promise.all(
        mediaMessages.map(async (message) => {
          try {
            const signedUrl = await resolveAttachmentUrl(message.mediaAttachment);
            return [message.id, signedUrl] as const;
          } catch {
            return [message.id, ""] as const;
          }
        }),
      );

      if (!active) return;

      setMessageMediaUrls((current) => {
        const next = { ...current };
        resolvedEntries.forEach(([messageId, signedUrl]) => {
          if (signedUrl) next[messageId] = signedUrl;
        });
        return next;
      });
    }

    void loadMediaUrls();

    return () => {
      active = false;
    };
  }, [selectedConversation]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore stop failures during unmount
      }
      stopRecordingTracks();
    };
  }, []);

  const openConversation = (phone: string) => {
    setNotice(null);
    setError(null);
    void navigate({
      to: "/admin/conversas",
      search: { phone },
    });
  };

  const closeConversation = () => {
    setReplyText("");
    setNotice(null);
    setError(null);
    void navigate({
      to: "/admin/conversas",
      search: {},
    });
  };

  const focusReplyWithMarker = (message: string) => {
    window.setTimeout(() => {
      replyTextareaRef.current?.focus();
      const manualMarker = "[DIGITE AQUI MANUALMENTE]";
      const markerIndex = message.indexOf(manualMarker);
      if (markerIndex >= 0) {
        replyTextareaRef.current?.setSelectionRange(markerIndex, markerIndex + manualMarker.length);
      }
    }, 0);
  };

  const applyStandardMessagePreset = async (preset: StandardMessagePreset) => {
    setError(null);
    setNotice(null);

    try {
      const nextMessage =
        preset.action === "charge-pending-signatures"
          ? await buildPendingSignatureChargeMessage(selectedConversation?.phone || "", users)
          : preset.buildMessage?.(selectedConversationFirstName) || "";

      setReplyText(nextMessage);
      focusReplyWithMarker(nextMessage);
    } catch (presetError) {
      setError(
        presetError instanceof Error
          ? presetError.message
          : "Nao foi possivel montar a mensagem padrao.",
      );
    }
  };

  const handleReply = async () => {
    const phone = selectedConversation?.phone || "";
    const text = replyText.trim();

    if (!phone) {
      setError("Selecione uma conversa para responder.");
      return;
    }

    if (!text) {
      setError("Digite uma mensagem para enviar.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setReplyText("");

    const now = new Date().toISOString();
    const optimisticId = `local-${phone}-${Date.now()}`;
    setOptimisticMessages((current) => [
      ...current,
      {
        id: optimisticId,
        phone,
        body: text,
        messageType: "text",
        occurredAt: now,
        createdAt: now,
        direction: "outgoing",
        status: "sending",
        senderName: currentAdminName,
      },
    ]);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const { data: result, error: replyError } = await supabase.functions.invoke(
        "admin-whatsapp-reply",
        {
          body: {
            to: phone,
            text,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (replyError) {
        throw new Error(await getFunctionInvokeErrorMessage(replyError, result?.error || null));
      }
      if (!result?.ok) throw new Error(result?.error || "Erro ao enviar resposta.");

      await loadConversations();
      setOptimisticMessages((current) => current.filter((message) => message.id !== optimisticId));
    } catch (sendError) {
      setOptimisticMessages((current) =>
        current.map((message) =>
          message.id === optimisticId ? { ...message, status: "failed" } : message,
        ),
      );
      setReplyText(text);
      setError(sendError instanceof Error ? sendError.message : "Erro ao enviar resposta.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendTemplate = async () => {
    const phone = selectedConversation?.phone || "";

    if (!phone) {
      setError("Selecione uma conversa para enviar o template.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const { data: result, error: replyError } = await supabase.functions.invoke(
        "admin-whatsapp-reply",
        {
          body: {
            to: phone,
            mode: "template",
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (replyError) {
        throw new Error(await getFunctionInvokeErrorMessage(replyError, result?.error || null));
      }
      if (!result?.ok) throw new Error(result?.error || "Erro ao enviar template.");

      setNotice("Oi enviado ao usuario por template.");
      await loadConversations();
      closeConversation();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Erro ao enviar template.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification === "undefined") {
      setError("Seu navegador nao suporta notificacoes.");
      return;
    }

    if (Notification.permission === "granted") {
      setNotice("As notificacoes ja estao ativadas.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setError(null);
      setNotice("Notificacoes ativadas para novas mensagens.");
      return;
    }

    setNotice(null);
    setError("Permita as notificacoes do site no navegador para receber alertas de novas mensagens.");
  };

  const handleAudioSelected = async (file: File | null | undefined) => {
    const phone = selectedConversation?.phone || "";
    if (!file) return;

    if (!phone) {
      setError("Selecione uma conversa para enviar audio.");
      return;
    }

    if (!file.type.startsWith("audio/")) {
      setError("Selecione um arquivo de audio valido.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      const base64 = await fileToBase64(file);
      const { data: result, error: replyError } = await supabase.functions.invoke(
        "admin-whatsapp-reply",
        {
          body: {
            to: phone,
            audio: {
              fileName: file.name,
              mimeType: file.type || "audio/ogg",
              base64,
            },
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (replyError) {
        throw new Error(await getFunctionInvokeErrorMessage(replyError, result?.error || null));
      }

      if (!result?.ok) throw new Error(result?.error || "Erro ao enviar audio.");

      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Erro ao enviar audio.");
    } finally {
      if (audioInputRef.current) audioInputRef.current.value = "";
      setSaving(false);
    }
  };

  const handleRecordAudio = async () => {
    if (recording) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        setError("Nao foi possivel finalizar a gravacao.");
      }
      return;
    }

    if (!selectedConversation?.phone) {
      setError("Selecione uma conversa para gravar audio.");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("O microfone so funciona em conexao segura (HTTPS).");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Seu navegador nao suporta gravacao de audio. Use o clipe para enviar um arquivo.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("Seu navegador nao suporta gravacao direta. Use o clipe para enviar um arquivo.");
      return;
    }

    setError(null);
    setNotice(null);

    try {
      if (navigator.permissions?.query) {
        const permissionStatus = await navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .catch(() => null);

        if (permissionStatus?.state === "denied") {
          setError("O microfone esta bloqueado no navegador. Libere a permissao do site e tente novamente.");
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
            ? "audio/ogg;codecs=opus"
            : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setRecording(false);
        stopRecordingTracks();
        setError("Erro ao gravar audio.");
      };

      recorder.onstop = () => {
        const chunkType = recorder.mimeType || mimeType || "audio/webm";
        const extension = chunkType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recordingChunksRef.current, { type: chunkType });
        const file = new File([blob], `gravacao-${Date.now()}.${extension}`, { type: chunkType });

        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        stopRecordingTracks();

        if (blob.size > 0) {
          void handleAudioSelected(file);
        } else {
          setError("A gravacao ficou vazia.");
        }
      };

      recorder.start();
      setRecording(true);
      setNotice("Gravando audio... clique no quadrado para enviar.");
    } catch (error) {
      stopRecordingTracks();
      setRecording(false);
      setError(getMicrophoneAccessMessage(error));
    }
  };

  const handleReplyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSlashMenuOpen && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const firstPreset = filteredStandardMessages[0];
      if (firstPreset) applyStandardMessagePreset(firstPreset);
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void handleReply();
  };

  return (
    <div className="flex h-[calc(100svh-64px)] min-h-0 flex-col overflow-hidden">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card className="min-h-0 flex-1 p-6 text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conversas...
          </div>
        </Card>
      ) : conversations.length === 0 ? (
        <Card className="min-h-0 flex-1 p-6 text-muted-foreground">
          Nenhuma conversa registrada no WhatsApp no momento.
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,34vh)_minmax(0,1fr)] overflow-hidden rounded-md border bg-[#efeae2] shadow-sm xl:grid-cols-[340px_minmax(0,1fr)] xl:grid-rows-1 2xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="flex min-h-0 flex-col overflow-hidden rounded-none border-0 border-b bg-white shadow-none xl:h-full xl:border-b-0 xl:border-r">
            <CardHeader className="shrink-0 border-b bg-[#f0f2f5] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Conversas</CardTitle>
                  <CardDescription className="mt-1">
                    Usuários e últimas mensagens.
                  </CardDescription>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-white">
                  <MessageCircle className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
              {conversations.map((conversation) => {
                const isActive = conversation.phone === selectedPhone;

                return (
                  <button
                    key={conversation.phone}
                    type="button"
                    onClick={() => openConversation(conversation.phone)}
                    className={`w-full border-b px-4 py-3 text-left transition-colors ${
                      isActive
                        ? "border-slate-200 bg-[#d9fdd3]"
                        : "border-slate-100 bg-white hover:bg-[#f5f6f6]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111b21] text-sm text-white">
                        {getInitials(conversation.displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-[#111b21]">
                                {conversation.displayName}
                              </p>
                              {!conversation.hasRegisteredUser ? (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.02em] text-amber-700">
                                  Sem cadastro
                                </span>
                              ) : null}
                            </div>
                            <p className="truncate text-xs text-[#667781]">
                              {formatPhone(conversation.phone)}
                            </p>
                            <p
                              className={`mt-1 text-[11px] ${
                                conversation.isWindowOpen ? "text-emerald-600" : "text-amber-600"
                              }`}
                            >
                              {conversation.isWindowOpen
                                ? "Janela de 24h aberta"
                                : "Sem entrada recente registrada"}
                            </p>
                          </div>
                          <p className="shrink-0 text-[11px] text-[#667781]">
                            {formatConversationTime(conversation.lastAt)}
                          </p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-[#667781]">
                          {conversation.preview}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-0 bg-[#efeae2] shadow-none xl:h-full">
            {selectedConversation ? (
              <>
                <CardHeader className="shrink-0 border-b bg-[#f0f2f5] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-sm text-white">
                        {getInitials(selectedConversation.displayName)}
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base text-[#111b21]">
                          <MessageSquareMore className="h-4 w-4" />
                          {selectedConversation.displayName}
                        </CardTitle>
                        {!selectedConversation.hasRegisteredUser ? (
                          <p className="mt-1 text-[11px] font-medium text-amber-700">
                            Contato sem cadastro no sistema.
                          </p>
                        ) : null}
                        <CardDescription className="text-xs">
                          {formatPhone(selectedConversation.phone)}
                        </CardDescription>
                        <p
                          className={`mt-0.5 text-[11px] ${
                            selectedConversation.isWindowOpen
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {selectedConversation.isWindowOpen
                            ? "Janela de 24h aberta para responder e notificar."
                            : "Janela fechada. Fora das 24h o admin envia somente um oi por template."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => void handleEnableNotifications()}
                      >
                        {notificationPermission === "granted" ? (
                          <Bell className="h-4 w-4" />
                        ) : (
                          <BellOff className="h-4 w-4" />
                        )}
                        {notificationPermission === "granted" ? "Alertas ligados" : "Ativar alertas"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {selectedConversation.messages.length}{" "}
                        {selectedConversation.messages.length === 1 ? "mensagem" : "mensagens"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5 xl:px-10">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.direction === "outgoing" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`relative max-w-[92%] rounded-2xl px-4 py-3 text-[14px] leading-6 shadow-sm sm:max-w-[80%] lg:max-w-[72%] xl:max-w-[66%] 2xl:max-w-[60%] ${
                            message.direction === "outgoing"
                              ? "bg-[#d9fdd3] text-[#111b21]"
                              : "bg-white text-[#111b21]"
                          }`}
                        >
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.02em] text-[#667781]">
                            {message.direction === "outgoing"
                              ? message.senderName?.trim() || "Admin"
                              : selectedConversation.displayName}
                          </p>
                          {message.messageType === "image" && messageMediaUrls[message.id] ? (
                            <div className="space-y-2">
                              <button
                                type="button"
                                className="block"
                                onClick={() => setExpandedImageUrl(messageMediaUrls[message.id] || null)}
                              >
                                <img
                                  src={messageMediaUrls[message.id]}
                                  alt="Imagem recebida no WhatsApp"
                                  className="max-h-80 max-w-full rounded-md object-contain"
                                />
                              </button>
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-6">
                                {getMessageDisplayBody(message)}
                              </p>
                            </div>
                          ) : message.messageType === "video" && messageMediaUrls[message.id] ? (
                            <div className="space-y-2">
                              <video controls preload="metadata" className="max-h-80 max-w-full rounded-md">
                                <source src={messageMediaUrls[message.id]} />
                                Seu navegador não suporta vídeo.
                              </video>
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-6">
                                {getMessageDisplayBody(message)}
                              </p>
                            </div>
                          ) : message.messageType === "audio" && messageMediaUrls[message.id] ? (
                            <div className="space-y-2">
                              <p
                                className={`whitespace-pre-wrap break-words text-[14px] leading-6 ${
                                  message.direction === "outgoing" ? "font-semibold" : ""
                                }`}
                              >
                                {getMessageDisplayBody(message)}
                              </p>
                              <audio controls preload="none" className="max-w-full">
                                <source src={messageMediaUrls[message.id]} />
                                Seu navegador não suporta áudio.
                              </audio>
                            </div>
                          ) : (
                            <p
                              className={`whitespace-pre-wrap break-words text-[14px] leading-6 ${
                                message.direction === "outgoing" ? "font-semibold" : ""
                              }`}
                            >
                              {getMessageDisplayBody(message)}
                            </p>
                          )}
                          <p className="mt-2 text-right text-[11px] text-[#667781]">
                            {getOutgoingStatusLabel(message.status) ||
                              formatDateTime(message.createdAt || message.occurredAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="shrink-0 border-t bg-[#f0f2f5] px-4 py-3">
                    {selectedConversation.isWindowOpen ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-end">
                          <p className="text-xs text-[#667781]">
                            Digite <span className="font-medium">/</span> para abrir um atalho.
                          </p>
                        </div>

                        <div className="flex items-end gap-3">
                          <input
                            ref={audioInputRef}
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={(event) => void handleAudioSelected(event.target.files?.[0])}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className={`h-11 w-11 shrink-0 rounded-full border-0 text-white ${
                              recording ? "bg-[#ef4444] hover:bg-[#dc2626]" : "bg-[#00a884] hover:bg-[#008f72]"
                            }`}
                            disabled={saving}
                            onClick={() => void handleRecordAudio()}
                            title={recording ? "Parar gravacao" : "Gravar audio"}
                            aria-label={recording ? "Parar gravacao" : "Gravar audio"}
                          >
                            {recording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-11 w-11 shrink-0 rounded-full border-0 bg-white text-[#54656f] hover:bg-white/90"
                            disabled={saving || recording}
                            onClick={() => audioInputRef.current?.click()}
                            title="Enviar audio"
                            aria-label="Enviar audio"
                          >
                            <Paperclip className="h-5 w-5" />
                          </Button>
                          <div className="relative flex-1">
                            <Textarea
                              ref={replyTextareaRef}
                              value={replyText}
                              onChange={(event) => setReplyText(event.target.value)}
                              onKeyDown={handleReplyKeyDown}
                              placeholder="Digite uma mensagem"
                              rows={1}
                              className={`resize-none border-0 bg-white px-4 py-3 leading-6 shadow-none focus-visible:ring-1 focus-visible:ring-[#00a884] ${
                                hasLongReplyDraft
                                  ? "max-h-[220px] min-h-[120px] rounded-2xl"
                                  : "max-h-40 min-h-11 rounded-3xl"
                              }`}
                            />
                            {isSlashMenuOpen ? (
                              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-10 rounded-2xl border border-[#d1d7db] bg-white p-2 shadow-lg">
                                <p className="px-2 pb-2 text-xs text-[#667781]">
                                  Atalhos de mensagem
                                </p>
                                <div className="space-y-1">
                                  {filteredStandardMessages.length ? (
                                    filteredStandardMessages.map((preset, index) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f5f6f6]"
                                        onClick={() => applyStandardMessagePreset(preset)}
                                      >
                                        <Check
                                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                                            index === 0 ? "text-[#00a884]" : "text-transparent"
                                          }`}
                                        />
                                        <span className="min-w-0 flex-1">
                                          <span className="block text-sm font-medium text-[#111b21]">
                                            {preset.label}
                                          </span>
                                          <span className="block text-xs text-[#667781]">
                                            {preset.description}
                                          </span>
                                        </span>
                                      </button>
                                    ))
                                  ) : (
                                    <p className="px-3 py-2 text-sm text-[#667781]">Nenhum atalho encontrado.</p>
                                  )}
                                </div>
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#667781]">
                              <p>Enter envia. Shift+Enter quebra linha.</p>
                              <p>
                                {replyLineCount} {replyLineCount === 1 ? "linha" : "linhas"} • {replyText.length} caracteres
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            className="h-11 w-11 shrink-0 rounded-full bg-[#00a884] text-white hover:bg-[#008f72]"
                            disabled={saving || !replyText.trim()}
                            onClick={() => void handleReply()}
                            title="Enviar"
                            aria-label="Enviar mensagem"
                          >
                            {saving ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Send className="h-5 w-5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-[#54656f]">
                          Fora da janela de 24h, o admin pode enviar somente um oi por template.
                        </p>
                        <Button
                          type="button"
                          className="bg-[#00a884] text-white hover:bg-[#008f72]"
                          disabled={saving}
                          onClick={() => void handleSendTemplate()}
                        >
                          {saving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="mr-2 h-4 w-4" />
                          )}
                          Enviar oi
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex h-full min-h-[420px] items-center justify-center p-6">
                <div className="mx-auto max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#d9fdd3] text-[#00a884]">
                    <MessageSquareMore className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-[#111b21]">Selecione uma conversa</h3>
                  <p className="mt-2 text-sm text-[#667781]">
                    Escolha um usuário na coluna ao lado para visualizar o histórico completo e
                    responder com mais organização.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      <Dialog open={Boolean(expandedImageUrl)} onOpenChange={(open) => !open && setExpandedImageUrl(null)}>
        <DialogContent className="max-w-5xl border-0 bg-black/95 p-2 shadow-2xl">
          {expandedImageUrl ? (
            <img
              src={expandedImageUrl}
              alt="Imagem ampliada da conversa"
              className="max-h-[88vh] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
