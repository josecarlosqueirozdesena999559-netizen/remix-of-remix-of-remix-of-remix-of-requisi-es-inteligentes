import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getAttachmentFile, getOutputSignedAttachment, getRequestSignedAttachment } from "@/lib/attachments";
import { buildGlobalRequestCodes } from "@/lib/request-code";

export const Route = createFileRoute("/admin/assinadas")({
  component: AssinadasPage,
});

interface RequisicaoAssinada {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
  solicitante: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
}

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRequestMonth(request: Pick<RequisicaoAssinada, "data" | "created_at">) {
  const displayDate = request.data?.trim();

  if (displayDate) {
    const brDate = displayDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brDate) return `${brDate[3]}-${brDate[2].padStart(2, "0")}`;

    const isoDate = displayDate.match(/^(\d{4})-(\d{2})/);
    if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  }

  return String(request.created_at || "").slice(0, 7);
}

function getStatusLabel(status: string) {
  if (status === "concluido") return "Concluida";
  if (status === "requisicao_assinada") return "Requisicao assinada";
  if (status === "recebido") return "Requisicao assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saida";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
}

function hasOutputDocument(request: RequisicaoAssinada) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
}

function hasSignedDocument(request: RequisicaoAssinada) {
  return Boolean(
    getRequestSignedAttachment(request.signed_attachment, request.status) ||
      hasOutputDocument(request),
  );
}

function AssinadasPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/assinadas";
  const [data, setData] = useState<RequisicaoAssinada[]>();
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const [requestsResult, allResult] = await Promise.all([
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment")
          .order("created_at", { ascending: false }),
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (requestsResult.error || allResult.error) {
        setError(requestsResult.error?.message || allResult.error?.message || "Erro ao carregar requisicoes.");
      } else {
        const requests = (requestsResult.data ?? []) as RequisicaoAssinada[];
        const completedWithoutOutput = requests.filter(
          (request) => request.status === "concluido" && !hasOutputDocument(request),
        );

        if (completedWithoutOutput.length > 0) {
          const { error: repairError } = await supabase
            .from("requisicoes")
            .update({ status: "recebido" })
            .in("id", completedWithoutOutput.map((request) => request.id));

          if (repairError) {
            setError(repairError.message);
            setLoading(false);
            return;
          }
        }

        setData(requests.filter(hasSignedDocument));
        setCodeByRequestId(buildGlobalRequestCodes((allResult.data ?? []) as RequisicaoAssinada[]));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const filteredData = useMemo(() => {
    return (data ?? []).filter((request) => getRequestMonth(request) === selectedMonth);
  }, [data, selectedMonth]);

  const grouped = useMemo(() => {
    const map = new Map<string, RequisicaoAssinada[]>();
    filteredData.forEach((request) => {
      const key = request.setor?.trim() || "Sem local";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(request);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredData]);

  if (isChildRoute) {
    return <Outlet />;
  }

  const selectedRequests = selected
    ? grouped.find(([local]) => local === selected)?.[1] ?? []
    : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Inicio / Assinadas</p>
        <h2 className="text-2xl text-foreground">Requisicoes assinadas</h2>
      </div>

      <Card className="p-4">
        <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
          Mes
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value || getCurrentMonth());
              setSelected(null);
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma requisicao encontrada neste mes.</Card>
      ) : selected ? (
        <Card className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Local selecionado</p>
              <p className="text-lg text-foreground">{selected}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Usuario</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Numero</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                </tr>
              </thead>
              <tbody>
                {selectedRequests.map((request) => {
                  const code = request.saida_codigo || codeByRequestId.get(request.id) || "-";
                  const requestAttachment = getRequestSignedAttachment(request.signed_attachment, request.status);
                  const outputAttachment =
                    getOutputSignedAttachment(request.signed_attachment, request.status) ||
                    getAttachmentFile(request.admin_attachment);
                  const hasPdf = Boolean(requestAttachment || outputAttachment);

                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{request.solicitante || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{code}</td>
                      <td className="px-3 py-2 text-muted-foreground">{getStatusLabel(request.status)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={!hasPdf}
                          onClick={() =>
                            navigate({
                              to: "/admin/assinadas/$requisicaoId/pdf",
                              params: { requisicaoId: request.id },
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                          Ver PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-6 bg-muted/30">
            <p className="text-sm text-muted-foreground">Primeiro passo</p>
            <p className="text-lg text-foreground">Escolha o local para conferir os PDFs do mes</p>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {grouped.map(([local, requests]) => (
              <button
                key={local}
                type="button"
                onClick={() => setSelected(local)}
                className="text-left rounded-md border-l-4 border-primary/60 p-4 bg-card hover:bg-accent/50 transition-colors"
              >
                <p className="text-foreground">{local}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {requests.length} {requests.length === 1 ? "registro" : "registros"}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
