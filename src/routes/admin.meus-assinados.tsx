import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getAttachmentFile, getOutputSignedAttachment } from "@/lib/attachments";
import {
  getRequestOwnerCpf,
  getRequestOwnerLocation,
  type RequestOwnerProfile,
} from "@/lib/request-owner";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/meus-assinados")({
  component: MeusAssinadosPage,
});

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
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

function getStatusLabel(status: string) {
  if (status === "concluido") return "Concluída";
  if (status === "requisicao_assinada") return "Requisição assinada";
  if (status === "recebido") return "Requisição assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saída";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
}

function hasOutputDocument(request: Requisicao) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
    getAttachmentFile(request.admin_attachment),
  );
}

async function fetchCompletedUserRequests(profile: RequestOwnerProfile) {
  const pageSize = 1000;
  let from = 0;
  const requests: Requisicao[] = [];
  const cpf = getRequestOwnerCpf(profile);
  const location = getRequestOwnerLocation(profile);
  const name = profile.nome?.trim() || "";

  if (!cpf && !(name && location)) {
    return requests;
  }

  while (true) {
    let query = supabase
      .from("requisicoes")
      .select("id,saida_codigo,setor,data,created_at,status,signed_attachment,admin_attachment")
      .eq("status", "concluido")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (cpf) {
      query = query.eq("solicitante_cpf", cpf);
    } else {
      query = query.eq("solicitante", name).eq("setor", location);
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const page = (data ?? []) as Requisicao[];
    requests.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return requests;
}

function MeusAssinadosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/meus-assinados";
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

        if (!profile) {
          setRequests([]);
          return;
        }

        const data = await fetchCompletedUserRequests(profile);
        if (active) {
          setRequests(data.filter(hasOutputDocument));
        }
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

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuario / Documentos assinados</p>
        <h2 className="text-2xl text-foreground">Documentos assinados</h2>
      </div>

      <Card className="p-4">
        <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
          Mês
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value || getCurrentMonth())}
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
      ) : filteredRequests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma requisição encontrada neste mês.</Card>
      ) : (
        <Card className="p-4">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                    <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                    <td className="px-3 py-2 text-foreground">{request.saida_codigo || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {getStatusLabel(request.status)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() =>
                          navigate({
                            to: "/admin/meus-assinados/$requisicaoId/pdf",
                            params: { requisicaoId: request.id },
                          })
                        }
                      >
                        <Eye className="h-4 w-4" />
                        Ver/Baixar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

