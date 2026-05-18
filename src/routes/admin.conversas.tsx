import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageCircle, MessageSquareMore, Paperclip, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { resolveAttachmentUrl, type AttachmentFile } from "@/lib/attachments";
import { getWhatsAppAdminNumbers } from "@/lib/app-settings-actions";
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
  preview: string;
  lastAt: string;
  lastIncomingAt: string | null;
  isWindowOpen: boolean;
  messages: ConversationMessage[];
};

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || "";
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

function isKnownNonAdminUserPhone(phone: string, users: UserRow[]) {
  const matchedUser = resolveConversationUser(phone, users);
  return Boolean(matchedUser) && !isAdminUser(matchedUser);
}

function getDisplayName(phone: string, users: UserRow[]) {
  const matchedUser = resolveConversationUser(phone, users);
  return matchedUser?.nome?.trim() || formatPhone(phone);
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

function getMessagePlaceholder(messageType: string, direction: "incoming" | "outgoing") {
  if (messageType === "audio") return direction === "incoming" ? "[audio recebido]" : "[audio enviado]";
  if (messageType === "image") return "[imagem]";
  if (messageType === "video") return direction === "incoming" ? "[video recebido]" : "[video enviado]";
  return "[mensagem sem texto]";
}

function getMessageDisplayBody(message: Pick<ConversationMessage, "body" | "messageType" | "direction">) {
  const body = message.body?.trim();
  if (body) return body;
  return getMessagePlaceholder(message.messageType, message.direction);
}

function getOutgoingStatusLabel(status?: ConversationMessage["status"]) {
  if (status === "sending") return "Enviando...";
  if (status === "failed") return "Falhou ao enviar";
  if (status === "read") return "Lido";
  if (status === "delivered") return "Entregue";
  if (status === "sent") return "Enviado";
  return null;
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
      body: message.body?.trim() || getMessagePlaceholder(message.message_type?.trim() || "", "incoming"),
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
    .filter(([phone]) => isKnownNonAdminUserPhone(phone, input.users))
    .map(([phone, messages]) => {
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
        displayName: getDisplayName(phone, input.users),
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
  const [replyText, setReplyText] = useState("");
  const [messageMediaUrls, setMessageMediaUrls] = useState<Record<string, string>>({});
  const [expandedImageUrl, setExpandedImageUrl] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

      const adminNumbersResult = await getWhatsAppAdminNumbers().catch(() => ({ numbers: [] }));
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
          .limit(500),
        (supabase as any)
          .from("whatsapp_outbound_message_audit")
          .select("message_id,recipient_id,body,message_type,occurred_at,created_at,raw_payload")
          .not("recipient_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("whatsapp_webhook_status_audit")
          .select("message_id,recipient_id,status,occurred_at,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("usuarios")
          .select("nome,whatsapp,is_admin,role")
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [selectedConversation?.phone, selectedConversation?.messages.length]);

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
        throw new Error(
          (replyError as any)?.context?.error ||
            (replyError as any)?.context?.message ||
            result?.error ||
            replyError.message,
        );
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
        throw new Error(
          (replyError as any)?.context?.error ||
            (replyError as any)?.context?.message ||
            result?.error ||
            replyError.message,
        );
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

  const handleReplyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,34vh)_minmax(0,1fr)] overflow-hidden rounded-md border bg-[#efeae2] shadow-sm xl:grid-cols-[360px_minmax(0,1fr)] xl:grid-rows-1 2xl:grid-cols-[400px_minmax(0,1fr)]">
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
                            <p className="truncate text-sm font-medium text-[#111b21]">
                              {conversation.displayName}
                            </p>
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
                            : "Sem entrada recente registrada. A API do WhatsApp validará o envio."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedConversation.messages.length}{" "}
                        {selectedConversation.messages.length === 1 ? "mensagem" : "mensagens"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.direction === "outgoing" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`relative max-w-[min(92%,720px)] rounded-md px-3 py-2 text-sm shadow-sm sm:max-w-[min(78%,760px)] lg:max-w-[min(68%,760px)] ${
                            message.direction === "outgoing"
                              ? "bg-[#d9fdd3] text-[#111b21]"
                              : "bg-white text-[#111b21]"
                          }`}
                        >
                          <p className="mb-1 text-[11px] font-medium text-[#667781]">
                            {message.direction === "outgoing" ? "Admin" : "Usuario"}
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
                              <p className="whitespace-pre-wrap break-words">
                                {getMessageDisplayBody(message)}
                              </p>
                            </div>
                          ) : message.messageType === "video" && messageMediaUrls[message.id] ? (
                            <div className="space-y-2">
                              <video controls preload="metadata" className="max-h-80 max-w-full rounded-md">
                                <source src={messageMediaUrls[message.id]} />
                                Seu navegador não suporta vídeo.
                              </video>
                              <p className="whitespace-pre-wrap break-words">
                                {getMessageDisplayBody(message)}
                              </p>
                            </div>
                          ) : message.messageType === "audio" && messageMediaUrls[message.id] ? (
                            <div className="space-y-2">
                              <p className="whitespace-pre-wrap break-words">
                                {getMessageDisplayBody(message)}
                              </p>
                              <audio controls preload="none" className="max-w-full">
                                <source src={messageMediaUrls[message.id]} />
                                Seu navegador não suporta áudio.
                              </audio>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">
                              {getMessageDisplayBody(message)}
                            </p>
                          )}
                          <p className="mt-1 text-right text-[11px] text-[#667781]">
                            {getOutgoingStatusLabel(message.status) ||
                              formatDateTime(message.createdAt || message.occurredAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="shrink-0 border-t bg-[#f0f2f5] px-4 py-3">
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
                        className="h-11 w-11 shrink-0 rounded-full border-0 bg-white text-[#54656f] hover:bg-white/90"
                        disabled={saving}
                        onClick={() => audioInputRef.current?.click()}
                        title="Enviar audio"
                        aria-label="Enviar audio"
                      >
                        <Paperclip className="h-5 w-5" />
                      </Button>
                      <Textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        onKeyDown={handleReplyKeyDown}
                        placeholder="Mensagem"
                        rows={1}
                        className="max-h-32 min-h-11 resize-none rounded-full border-0 bg-white px-4 py-3 shadow-none focus-visible:ring-1 focus-visible:ring-[#00a884]"
                      />
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
