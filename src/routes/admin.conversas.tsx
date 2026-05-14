import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MessageSquareMore, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
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
  } | null;
};

type UserRow = {
  nome: string | null;
  whatsapp: string | null;
};

type ConversationMessage = {
  id: string;
  phone: string;
  body: string;
  messageType: string;
  occurredAt: string;
  createdAt: string;
  direction: "incoming" | "outgoing";
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

function resolveConversationUser(phone: string, users: UserRow[]) {
  const exactMatch = users.find((user) => canonicalConversationPhone(user.whatsapp) === phone);
  if (exactMatch?.nome?.trim()) return exactMatch;

  const variantMatches = users.filter((user) => phonesMatch(user.whatsapp || "", phone));
  if (variantMatches.length === 1 && variantMatches[0]?.nome?.trim()) {
    return variantMatches[0];
  }

  return null;
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

function buildConversationSummaries(input: {
  incoming: IncomingMessage[];
  outgoing: OutgoingMessage[];
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
      body: message.body?.trim() || "[mensagem sem texto]",
      messageType: message.message_type?.trim() || "desconhecida",
      occurredAt: message.occurred_at || message.created_at,
      createdAt: message.created_at,
      direction: "incoming",
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
    });
    byPhone.set(phone, next);
  });

  return [...byPhone.entries()]
    .map(([phone, messages]) => {
      const sortedMessages = [...messages].sort(
        (left, right) => getMessageSortTime(left) - getMessageSortTime(right),
      );
      const lastMessage = sortedMessages[sortedMessages.length - 1];
      const lastIncomingMessage =
        [...sortedMessages].reverse().find((message) => message.direction === "incoming") || null;

      const lastIncomingAt = lastIncomingMessage?.createdAt || lastIncomingMessage?.occurredAt || null;

      return {
        phone,
        displayName: getDisplayName(phone, input.users),
        preview: lastMessage?.body || "",
        lastAt: lastMessage?.createdAt || lastMessage?.occurredAt || new Date(0).toISOString(),
        lastIncomingAt,
        isWindowOpen: isWhatsAppWindowOpen(lastIncomingAt),
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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

      const [incomingResult, outgoingResult, usersResult] = await Promise.all([
        (supabase as any)
          .from("whatsapp_webhook_message_audit")
          .select("message_id,sender_id,body,message_type,occurred_at,created_at")
          .not("sender_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("whatsapp_outbound_message_audit")
          .select("message_id,recipient_id,body,message_type,occurred_at,created_at,raw_payload")
          .not("recipient_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("usuarios").select("nome,whatsapp").not("whatsapp", "is", null),
      ]);

      if (incomingResult.error || outgoingResult.error || usersResult.error) {
        throw new Error(
          incomingResult.error?.message ||
            outgoingResult.error?.message ||
            usersResult.error?.message ||
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
      setUsers((usersResult.data ?? []) as UserRow[]);
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
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const conversations = useMemo(
    () => buildConversationSummaries({ incoming, outgoing, users }),
    [incoming, outgoing, users],
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

      setReplyText("");
      setNotice("Resposta enviada com sucesso.");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Erro ao enviar resposta.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Admin / WhatsApp</p>
        <h2 className="text-2xl text-foreground">Conversas</h2>
      </div>

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
        <Card className="p-6 text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando conversas...
          </div>
        </Card>
      ) : conversations.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhuma conversa registrada no WhatsApp no momento.
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden xl:h-[72vh] xl:flex xl:flex-col">
            <CardHeader className="border-b bg-linear-to-b from-slate-50 to-white">
              <CardTitle>Conversas</CardTitle>
              <CardDescription>
                Nome, numero e ultima mensagem de cada usuario.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[72vh] space-y-2 overflow-y-auto p-3">
              {conversations.map((conversation) => {
                const isActive = conversation.phone === selectedPhone;

                return (
                  <button
                    key={conversation.phone}
                    type="button"
                    onClick={() => openConversation(conversation.phone)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                      isActive
                        ? "border-sky-300 bg-sky-50 shadow-sm"
                        : "border-border/70 bg-card hover:border-sky-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm text-white">
                        {getInitials(conversation.displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {conversation.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
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
                          <p className="shrink-0 text-[11px] text-muted-foreground">
                            {formatConversationTime(conversation.lastAt)}
                          </p>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {conversation.preview}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden xl:h-[72vh] xl:flex xl:flex-col">
            {selectedConversation ? (
              <>
                <CardHeader className="border-b bg-linear-to-r from-sky-50 via-white to-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-sm text-white shadow-sm">
                        {getInitials(selectedConversation.displayName)}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Conversa</p>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquareMore className="h-5 w-5" />
                          {selectedConversation.displayName}
                        </CardTitle>
                        <CardDescription>{formatPhone(selectedConversation.phone)}</CardDescription>
                        <p
                          className={`mt-1 text-xs ${
                            selectedConversation.isWindowOpen
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {selectedConversation.isWindowOpen
                            ? "Janela de 24h aberta para responder e notificar."
                            : "Sem entrada recente registrada. A API do WhatsApp validara o envio."}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedConversation.messages.length} mensagem
                        {selectedConversation.messages.length === 1 ? "" : "ens"}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={closeConversation}>
                        Sair do chat
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-6">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-3xl border bg-muted/20 p-4">
                    {selectedConversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.direction === "outgoing" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%] ${
                            message.direction === "outgoing"
                              ? "bg-sky-600 text-white"
                              : "border bg-background text-foreground"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p
                            className={`mt-2 text-[11px] ${
                              message.direction === "outgoing"
                                ? "text-sky-100"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatDateTime(message.createdAt || message.occurredAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="rounded-3xl border bg-card p-4">
                    <div className="space-y-3">
                      <Textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        placeholder="Digite a resposta para o usuario"
                        rows={4}
                        disabled={saving}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          className="gap-2"
                          disabled={saving}
                          onClick={() => void handleReply()}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Enviar resposta
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex h-full min-h-[420px] items-center justify-center p-6">
                <div className="mx-auto max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-100 text-sky-700">
                    <MessageSquareMore className="h-8 w-8" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-foreground">Selecione uma conversa</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Escolha um usuario na coluna ao lado para visualizar o historico completo e
                    responder com mais organizacao.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
