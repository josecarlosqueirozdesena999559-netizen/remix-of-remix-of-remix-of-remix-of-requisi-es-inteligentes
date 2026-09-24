import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getAttachmentFile, getOutputSignedAttachment } from "@/lib/attachments";
import {
  getRequestOwnerCpfVariants,
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
function getStatusLabel(status: string) {
  if (status === "concluido") return "Concluída";
  if (status === "requisicao_assinada") return "Solicitação assinada";
  if (status === "recebido") return "Solicitação assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saída do SIG";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
}
function hasOutputDocument(request: Requisicao) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
    getAttachmentFile(request.admin_attachment),
  );
}
function getUniqueLocations(locations: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return locations
    .map((location) => location?.trim())
    .filter((location): location is string => Boolean(location))
    .filter((location) => {
      const key = location.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
async function getLinkedRequestLocations(profile: RequestOwnerProfile, fallbackLocation: string) {
  const profileId = "id" in profile ? String(profile.id || "") : "";
  if (!profileId) return getUniqueLocations([fallbackLocation]);
  const { data, error } = await supabase
    .from("setor_responsaveis")
    .select("setores(nome)")
    .eq("usuario_id", profileId);
  if (error) throw new Error(error.message);
  const linkedLocations = (data ?? []).map((row) => {
    const setor = Array.isArray(row.setores) ? row.setores[0] : row.setores;
    return setor?.nome;
  });
  return getUniqueLocations([fallbackLocation, ...linkedLocations]);
}
async function fetchCompletedUserRequests(profile: RequestOwnerProfile) {
  const pageSize = 1000;
  const requests: Requisicao[] = [];
  const cpfVariants = getRequestOwnerCpfVariants(profile);
  const location = getRequestOwnerLocation(profile);
  const linkedLocations = await getLinkedRequestLocations(profile, location);
  const name = profile.nome?.trim() || "";
  if (cpfVariants.length === 0 && !(name && linkedLocations.length > 0)) {
    return requests;
  }
  async function fetchPages(applyScope: (query: any) => any) {
    let from = 0;
    while (true) {
      const query = applyScope(
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,data,created_at,status,signed_attachment,admin_attachment")
          .eq("status", "concluido")
          .order("updated_at", { ascending: false })
          .range(from, from + pageSize - 1),
      );
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Requisicao[];
      requests.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
  }
  if (cpfVariants.length > 0) {
    await fetchPages((query) => query.in("solicitante_cpf", cpfVariants));
  }
  if (name && linkedLocations.length > 0) {
    await fetchPages((query) => query.eq("solicitante", name).in("setor", linkedLocations));
  }
  return requests.filter((request, index, list) => {
    return list.findIndex((item) => item.id === request.id) === index;
  });
}
function MeusAssinadosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/meus-assinados";
  const [requests, setRequests] = useState<Requisicao[]>([]);
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
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar solicitações.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);
  if (isChildRoute) {
    return <Outlet />;
  }
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuario / Documentos assinados</p>
        <h2 className="text-2xl text-foreground">Documentos assinados</h2>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma solicitação encontrada.</Card>
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
                {requests.map((request) => (
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
