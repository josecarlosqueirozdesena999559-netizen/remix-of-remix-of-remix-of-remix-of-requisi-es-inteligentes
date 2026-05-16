import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquareMore } from "lucide-react";
import { useEffect, useState } from "react";
import { ListPage, type Column } from "@/components/ListPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/whatsapp-usuarios")({
  component: WhatsAppUsuariosPage,
});

type UserRow = {
  id: string;
  nome: string | null;
  email: string | null;
  cpf: string | null;
  whatsapp: string | null;
  is_admin: boolean | null;
};

type IncomingMessageRow = {
  sender_id: string | null;
  body: string | null;
  occurred_at: string | null;
  created_at: string;
};

type AppSettingRow = {
  key: string;
  value: string | null;
};

type WhatsAppUserStatusRow = {
  id: string;
  nome: string;
  email: string;
  cpf: string;
  whatsapp: string;
  status: "open" | "closed" | "missing";
  statusLabel: string;
  lastIncomingAt: string | null;
  lastPreview: string;
};

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
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

  return value || "—";
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isWhatsAppWindowOpen(value: string | null) {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed > Date.now() - 24 * 60 * 60 * 1000;
}

function getLatestIncomingByPhone(messages: IncomingMessageRow[]) {
  const latestByPhone = new Map<string, IncomingMessageRow>();

  messages.forEach((message) => {
    const phone = canonicalConversationPhone(message.sender_id);
    if (!phone) return;

    const current = latestByPhone.get(phone);
    const currentTime = current ? Date.parse(current.created_at || current.occurred_at || "") : 0;
    const nextTime = Date.parse(message.created_at || message.occurred_at || "");

    if (!current || nextTime >= currentTime) {
      latestByPhone.set(phone, message);
    }
  });

  return latestByPhone;
}

function buildUserSessionMap(rows: AppSettingRow[]) {
  return rows.reduce((sessions, row) => {
    if (!row.key.startsWith("WHATSAPP_USER_SESSION_")) return sessions;

    const phone = canonicalConversationPhone(row.key.replace("WHATSAPP_USER_SESSION_", ""));
    const value = row.value?.trim();
    if (phone && value) sessions.set(phone, value);
    return sessions;
  }, new Map<string, string>());
}

function getStatusBadge(status: WhatsAppUserStatusRow["status"], label: string) {
  if (status === "open") {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{label}</Badge>;
  }

  if (status === "closed") {
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{label}</Badge>;
  }

  return <Badge variant="secondary">{label}</Badge>;
}

function WhatsAppUsuariosPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<WhatsAppUserStatusRow[]>([]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const { user, profile } = await getCurrentUserProfile();

        if (!active) return;
        if (!user) {
          navigate({ to: "/" });
          return;
        }

        if (!profile?.is_admin) {
          navigate({ to: "/admin" });
          return;
        }

        const [usersResult, messagesResult, sessionsResult] = await Promise.all([
          supabase
            .from("usuarios")
            .select("id,nome,email,cpf,whatsapp,is_admin")
            .eq("is_admin", false)
            .not("whatsapp", "is", null)
            .neq("whatsapp", "")
            .order("nome", { ascending: true }),
          (supabase as any)
            .from("whatsapp_webhook_message_audit")
            .select("sender_id,body,occurred_at,created_at")
            .not("sender_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(2000),
          (supabase as any)
            .from("app_settings")
            .select("key,value")
            .like("key", "WHATSAPP_USER_SESSION_%"),
        ]);

        if (usersResult.error || messagesResult.error || sessionsResult.error) {
          throw new Error(
            usersResult.error?.message ||
              messagesResult.error?.message ||
              sessionsResult.error?.message ||
              "Erro ao carregar status do WhatsApp.",
          );
        }

        const users = ((usersResult.data ?? []) as UserRow[]).filter((user) =>
          Boolean(canonicalConversationPhone(user.whatsapp)),
        );
        const latestIncomingByPhone = getLatestIncomingByPhone(
          (messagesResult.data ?? []) as IncomingMessageRow[],
        );
        const userSessions = buildUserSessionMap((sessionsResult.data ?? []) as AppSettingRow[]);

        const nextRows = users
          .map((user) => {
            const phone = canonicalConversationPhone(user.whatsapp);
            const matchedIncomingEntry = phone
              ? [...latestIncomingByPhone.entries()].find(([messagePhone]) => phonesMatch(messagePhone, phone))
              : null;

            const lastIncoming = matchedIncomingEntry?.[1] ?? null;
            const sessionValue = phone
              ? [...userSessions.entries()].find(([sessionPhone]) => phonesMatch(sessionPhone, phone))?.[1] || null
              : null;
            const sessionOpen =
              Boolean(sessionValue) &&
              Number.isFinite(Date.parse(sessionValue || "")) &&
              Date.parse(sessionValue || "") > Date.now();
            const recentIncomingOpen = isWhatsAppWindowOpen(
              lastIncoming?.created_at || lastIncoming?.occurred_at || null,
            );

            const status: WhatsAppUserStatusRow["status"] = !phone
              ? "missing"
              : sessionOpen || recentIncomingOpen
                ? "open"
                : "closed";

            return {
              id: user.id,
              nome: user.nome?.trim() || "Sem nome",
              email: user.email?.trim() || "—",
              cpf: user.cpf?.trim() || "—",
              whatsapp: phone,
              status,
              statusLabel:
                status === "open"
                  ? "Janela aberta"
                  : status === "closed"
                    ? "Janela fechada"
                    : "Sem WhatsApp",
              lastIncomingAt: lastIncoming?.created_at || lastIncoming?.occurred_at || null,
              lastPreview: lastIncoming?.body?.trim() || "Sem mensagem recente",
            } satisfies WhatsAppUserStatusRow;
          })
          .sort((left, right) => {
            const statusWeight = { closed: 0, missing: 1, open: 2 } as const;
            if (statusWeight[left.status] !== statusWeight[right.status]) {
              return statusWeight[left.status] - statusWeight[right.status];
            }
            return left.nome.localeCompare(right.nome, "pt-BR");
          });

        if (active) {
          setRows(nextRows);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Erro ao carregar status do WhatsApp.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadData();

    const channel = supabase
      .channel("admin-whatsapp-usuarios-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => void loadData())
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_webhook_message_audit" },
        () => void loadData(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => void loadData())
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [navigate]);

  const columns: Column<WhatsAppUserStatusRow>[] = [
    { key: "nome", label: "Nome" },
    { key: "email", label: "E-mail" },
    { key: "cpf", label: "CPF" },
    {
      key: "whatsapp",
      label: "WhatsApp",
      render: (row) => (row.whatsapp ? formatPhone(row.whatsapp) : "—"),
    },
    {
      key: "statusLabel",
      label: "Janela",
      render: (row) => getStatusBadge(row.status, row.statusLabel),
    },
    {
      key: "lastIncomingAt",
      label: "Última entrada",
      render: (row) => formatDateTime(row.lastIncomingAt),
    },
    {
      key: "lastPreview",
      label: "Última mensagem",
      render: (row) => <span className="line-clamp-2 max-w-[280px]">{row.lastPreview}</span>,
    },
  ];

  return (
    <ListPage
      breadcrumb="Admin / WhatsApp"
      title="Usuários WhatsApp"
      description="Veja quem tem WhatsApp cadastrado e quais usuários estão com a janela de 24 horas aberta."
      data={rows}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "email", "cpf", "whatsapp", "statusLabel", "lastPreview"]}
      emptyMessage="Nenhum usuário encontrado."
      actions={(row) =>
        row.whatsapp ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/admin/conversas",
                search: { phone: row.whatsapp },
              })
            }
          >
            <MessageSquareMore className="h-4 w-4" />
            Conversa
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Sem número</span>
        )
      }
    />
  );
}
