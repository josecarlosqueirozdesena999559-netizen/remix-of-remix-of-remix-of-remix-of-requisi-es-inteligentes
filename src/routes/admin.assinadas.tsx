import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getOutputSignedAttachment, getRequestSignedAttachment } from "@/lib/attachments";
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

function AssinadasPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/assinadas";
  const [data, setData] = useState<RequisicaoAssinada[]>();
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const [completedResult, allResult] = await Promise.all([
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment")
          .eq("status", "concluido")
          .order("created_at", { ascending: false }),
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (completedResult.error || allResult.error) {
        setError(completedResult.error?.message || allResult.error?.message || "Erro ao carregar assinadas.");
      } else {
        setData((completedResult.data ?? []) as RequisicaoAssinada[]);
        setCodeByRequestId(buildGlobalRequestCodes((allResult.data ?? []) as RequisicaoAssinada[]));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, RequisicaoAssinada[]>();
    (data ?? []).forEach((request) => {
      const key = request.setor?.trim() || "Sem local";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(request);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (isChildRoute) {
    return <Outlet />;
  }

  const selectedRequests = selected
    ? grouped.find(([local]) => local === selected)?.[1] ?? []
    : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Início / Assinadas</p>
        <h2 className="text-2xl text-foreground">Requisições Assinadas</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma requisição assinada concluída.</Card>
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
                  <th className="px-3 py-2 text-left font-normal">Usuário</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-right font-normal">PDF completo</th>
                </tr>
              </thead>
              <tbody>
                {selectedRequests.map((request) => {
                  const code = request.saida_codigo || codeByRequestId.get(request.id) || "-";
                  const requestAttachment = getRequestSignedAttachment(request.signed_attachment, request.status);
                  const outputAttachment =
                    getOutputSignedAttachment(request.signed_attachment, request.status) ||
                    request.admin_attachment;
                  const hasCompletePdf = Boolean(requestAttachment || outputAttachment);

                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{request.solicitante || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{code}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          disabled={!hasCompletePdf}
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
            <p className="text-lg text-foreground">Escolha o local para conferir os PDFs assinados</p>
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
