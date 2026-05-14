import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquareMore, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  direction: "incoming" | "outgoing";
};

type ConversationSummary = {
  phone: string;
  displayName: string;
  preview: string;
  lastAt: string;
  messages: ConversationMessage[];
};

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits || "";
}

function getPhoneVariants(phone: string) {
  const digits = normalizePhone(phone);
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

function getDisplayName(phone: string, users: UserRow[]) {
  const matchedUser = users.find((user) => phonesMatch(user.whatsapp || "", phone));
  return matchedUser?.nome?.trim() || formatPhone(phone);
}

function buildConversationSummaries(input: {
  incoming: IncomingMessage[];
  outgoing: OutgoingMessage[];
  users: UserRow[];
}) {
  const byPhone = new Map<string, ConversationMessage[]>();

  input.incoming.forEach((message) => {
    const phone = normalizePhone(message.sender_id);
    if (!phone) return;

    const next = byPhone.get(phone) || [];
    next.push({
      id: message.message_id,
      phone,
      body: message.body?.trim() || "[mensagem sem texto]",
      messageType: message.message_type?.trim() || "desconhecida",
      occurredAt: message.occurred_at || message.created_at,
      direction: "incoming",
    });
    byPhone.set(phone, next);
  });

  input.outgoing.forEach((message) => {
    const phone = normalizePhone(message.recipient_id);
    if (!phone) return;

    const next = byPhone.get(phone) || [];
    next.push({
      id: message.message_id,
      phone,
      body: message.body?.trim() || "[mensagem sem texto]",
      messageType: message.message_type?.trim() || "text",
      occurredAt: message.occurred_at || message.created_at,
      direction: "outgoing",
    });
    byPhone.set(phone, next);
  });

  return [...byPhone.entries()]
    .map(([phone, messages]) => {
      const sortedMessages = [...messages].sort(
        (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
      );
      const lastMessage = sortedMessages[sortedMessages.length - 1];

      return {
        phone,
        displayName: getDisplayName(phone, input.users),
        preview: lastMessage?.body || "",
        lastAt: lastMessage?.occurredAt || new Date(0).toISOString(),
        messages: sortedMessages,
      } satisfies ConversationSummary;
    })
    .sort((left, right) => new Date(right.lastAt).getTime() - new Date(left.lastAt).getTime());
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
      const adminNumbers = Array.isArray((adminNumbersResult as any)?.numbers)
        ? (adminNumbersResult as any).numbers.map(String)
        : [];

      const [incomingResult, outgoingResult, usersResult] = await Promise.all([
        (supabase as any)
          .from("whatsapp_webhook_message_audit")
          .select("message_id,sender_id,body,message_type,occurred_at,created_at")
          .not("sender_id", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("whatsapp_outbound_message_audit")
          .select("message_id,recipient_id,body,message_type,occurred_at,created_at")
          .not("recipient_id", "is", null)
          .order("occurred_at", { ascending: false })
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
          (message) => !adminNumbers.some((adminNumber) => phonesMatch(adminNumber, message.sender_id || "")),
        ),
      );
      setOutgoing((outgoingResult.data ?? []) as OutgoingMessage[]);
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

    const intervalId = window.setInterval(() => {
      void loadConversations();
    }, 20000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const conversations = useMemo(
    () => buildConversationSummaries({ incoming, outgoing, users }),
    [incoming, outgoing, users],
  );

  const selectedPhone = normalizePhone(search.phone);

  useEffect(() => {
    if (selectedPhone && !conversations.some((conversation) => conversation.phone === selectedPhone)) {
      void navigate({
        to: "/admin/conversas",
        search: {},
        replace: true,
      });
    }
  }, [conversations, navigate, selectedPhone]);

  const selectedConversation =
    conversations.find((conversation) => conversation.phone === selectedPhone) || null;

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

      if (replyError) throw new Error(replyError.message);
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

      <Alert className="border-sky-200 bg-sky-50 text-sky-950">
        <AlertDescription>
          Aqui ficam as conversas recebidas no numero oficial do almoxarifado. Clique em um
          contato para abrir o chat individual e responder enquanto a janela de 24 horas do
          WhatsApp estiver ativa. Se esse prazo fechar, sera preciso aguardar uma nova mensagem do
          usuario.
        </AlertDescription>
      </Alert>

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
          Nenhuma mensagem recebida no WhatsApp ate agora.
        </Card>
      ) : (
        <div className="space-y-4">
          {!selectedConversation ? (
            <Card>
              <CardHeader>
                <CardTitle>Conversas</CardTitle>
                <CardDescription>
                  Selecione um contato para abrir o historico completo e responder por aqui.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.phone}
                    type="button"
                    onClick={() => openConversation(conversation.phone)}
                    className="w-full rounded-2xl border border-border/70 bg-card px-4 py-4 text-left transition-all hover:border-sky-300 hover:bg-sky-50/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-foreground">
                          {conversation.displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatPhone(conversation.phone)}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(conversation.lastAt)}
                      </p>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {conversation.preview}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="gap-4 border-b bg-linear-to-r from-sky-50 via-white to-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="icon" onClick={closeConversation}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                      <p className="text-sm text-muted-foreground">Conversa individual</p>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquareMore className="h-5 w-5" />
                        {selectedConversation.displayName}
                      </CardTitle>
                      <CardDescription>{formatPhone(selectedConversation.phone)}</CardDescription>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedConversation.messages.length} mensagem
                    {selectedConversation.messages.length === 1 ? "" : "ens"}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-3xl border bg-muted/20 p-4">
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
                          {formatDateTime(message.occurredAt)}
                        </p>
                      </div>
                    </div>
                  ))}
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
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
