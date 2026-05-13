import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock3, Eye, Loader2, PenLine, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getRequestSignedAttachment } from "@/lib/attachments";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/minhas-requisicoes")({
  component: MinhasRequisicoesPage,
});

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
  data: string | null;
  created_at: string;
  updated_at: string | null;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
  return_reason: string | null;
}

type StatusGroup = "admin" | "usuario" | "concluido";

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRequestMonth(request: Pick<Requisicao, "data" | "created_at">) {
  const displayDate = request.data?.trim();

  if (displayDate) {
    const brDate = displayDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brDate) return `${brDate[3]}-${brDate[2].padStart(2, "0")}`;

    const isoDate = displayDate.match(/^(\d{4})-(\d{2})/);
    if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  }

  return String(request.created_at || "").slice(0, 7);
}

function getStatusGroup(status: string): StatusGroup {
  if (status === "recebido" || status === "requisicao_assinada") return "admin";
  if (
    status === "aguardando_assinatura" ||
    status === "aguardando_assinatura_requisicao" ||
    status === "aguardando_assinatura_saida" ||
    status === "correcao_requisicao"
  ) {
    return "usuario";
  }

  return "concluido";
}

function getStatusInfo(request: Requisicao) {
  const requestSigned = Boolean(getRequestSignedAttachment(request.signed_attachment, request.status));

  if (request.status === "recebido" || request.status === "requisicao_assinada") {
    return {
      icon: Clock3,
      label: "Com o admin",
      detail: "Aguardando atendimento e anexo da saida.",
      className: "border-blue-200 bg-blue-50 text-blue-800",
    };
  }

  if (request.status === "aguardando_assinatura_saida") {
    return {
      icon: PenLine,
      label: "Falta assinar a saida",
      detail: requestSigned
        ? "O admin anexou a saida. Assine para concluir."
        : "Aguardando documento para assinatura.",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (request.status === "correcao_requisicao") {
    return {
      icon: Wrench,
      label: "Precisa corrigir",
      detail: request.return_reason || "A requisicao foi devolvida para ajuste.",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (request.status === "concluido") {
    return {
      icon: CheckCircle2,
      label: "Concluida",
      detail: "Atendimento finalizado.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  return {
    icon: PenLine,
    label: "Falta sua assinatura",
    detail: "Assine a requisicao para enviar ao admin.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

async function fetchUserRequests(cpf: string) {
  const pageSize = 1000;
  let from = 0;
  const requests: Requisicao[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("requisicoes")
      .select(
        "id,saida_codigo,setor,data,created_at,updated_at,status,signed_attachment,admin_attachment,return_reason",
      )
      .eq("solicitante_cpf", cpf)
      .in("status", [
        "aguardando_assinatura",
        "aguardando_assinatura_requisicao",
        "correcao_requisicao",
        "recebido",
        "requisicao_assinada",
        "aguardando_assinatura_saida",
        "concluido",
      ])
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as Requisicao[];
    requests.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return requests;
}

function MinhasRequisicoesPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<Requisicao[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [selectedGroup, setSelectedGroup] = useState<StatusGroup | "todas">("todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { profile } = await getCurrentUserProfile();

        if (!profile?.cpf) {
          setRequests([]);
          return;
        }

        const data = await fetchUserRequests(profile.cpf);
        if (active) setRequests(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar requisicoes.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const monthMatches = getRequestMonth(request) === selectedMonth;
      const groupMatches =
        selectedGroup === "todas" || getStatusGroup(request.status) === selectedGroup;

      return monthMatches && groupMatches;
    });
  }, [requests, selectedGroup, selectedMonth]);

  const totals = useMemo(() => {
    return requests.reduce(
      (acc, request) => {
        acc[getStatusGroup(request.status)] += 1;
        return acc;
      },
      { admin: 0, usuario: 0, concluido: 0 },
    );
  }, [requests]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuario / Requisicoes</p>
        <h2 className="text-2xl text-foreground">Minhas requisicoes</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Com o admin</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totals.admin}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Faltando voce</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totals.usuario}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Concluidas</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{totals.concluido}</p>
        </Card>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-48 flex-col gap-2 text-sm text-muted-foreground">
          Mes
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value || getCurrentMonth())}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="flex min-w-56 flex-col gap-2 text-sm text-muted-foreground">
          Situacao
          <select
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value as StatusGroup | "todas")}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
          >
            <option value="todas">Todas</option>
            <option value="admin">Com o admin</option>
            <option value="usuario">Faltando voce</option>
            <option value="concluido">Concluidas</option>
          </select>
        </label>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : filteredRequests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhuma requisicao encontrada para os filtros selecionados.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Numero</th>
                  <th className="px-3 py-2 text-left font-normal">Situacao</th>
                  <th className="px-3 py-2 text-right font-normal">Acao</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const info = getStatusInfo(request);
                  const StatusIcon = info.icon;
                  const isCorrection = request.status === "correcao_requisicao";

                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{request.saida_codigo || "-"}</td>
                      <td className="px-3 py-2">
                        <div
                          className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${info.className}`}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {info.label}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{info.detail}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              navigate({
                                to: "/admin/minhas-assinaturas/$requisicaoId/pdf",
                                params: { requisicaoId: request.id },
                              })
                            }
                          >
                            <Eye className="h-4 w-4" />
                            Ver/Baixar
                          </Button>
                          {isCorrection && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                if (typeof window !== "undefined") {
                                  window.location.assign(`/admin/requisicao?requisicaoId=${request.id}`);
                                }
                              }}
                            >
                              <Wrench className="h-4 w-4" />
                              Corrigir
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
