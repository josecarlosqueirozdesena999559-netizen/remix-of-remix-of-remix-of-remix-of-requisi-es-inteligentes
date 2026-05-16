import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock3, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
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
}

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

async function fetchUserRequests(cpf: string) {
  const pageSize = 1000;
  let from = 0;
  const requests: Requisicao[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("requisicoes")
      .select("id,saida_codigo,setor,data,created_at,updated_at,status,signed_attachment")
      .eq("solicitante_cpf", cpf)
      .in("status", ["recebido", "requisicao_assinada"])
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
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar requisições.");
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
    return requests.filter((request) => getRequestMonth(request) === selectedMonth);
  }, [requests, selectedMonth]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuário / Requisições</p>
        <h2 className="text-2xl text-foreground">Minhas requisições</h2>
      </div>

      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <label className="flex min-w-48 flex-col gap-2 text-sm text-muted-foreground">
          Mês
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value || getCurrentMonth())}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
          />
        </label>
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {filteredRequests.length} {filteredRequests.length === 1 ? "requisição" : "requisições"} com o admin
        </div>
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
          Nenhuma requisição com o admin neste mês.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-left font-normal">Situação</th>
                  <th className="px-3 py-2 text-right font-normal">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{request.saida_codigo || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
                          <Clock3 className="h-3.5 w-3.5" />
                          Com o admin
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Aguardando atendimento e anexo da saída.
                        </p>
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
                            Ver / Baixar
                          </Button>
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
