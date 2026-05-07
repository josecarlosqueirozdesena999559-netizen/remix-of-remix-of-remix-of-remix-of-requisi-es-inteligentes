import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
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

        if (!profile?.cpf) {
          setRequests([]);
          return;
        }

        const { data, error } = await supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,data,created_at,status")
          .eq("solicitante_cpf", profile.cpf)
          .eq("status", "concluido")
          .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);
        if (active) setRequests((data ?? []) as Requisicao[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar assinados.");
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
        <p className="text-sm text-muted-foreground">Usuário / Assinados</p>
        <h2 className="text-2xl text-foreground">Assinados</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma requisição concluída.</Card>
      ) : (
        <Card className="p-4">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-right font-normal">PDF completo</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                    <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                    <td className="px-3 py-2 text-foreground">{request.saida_codigo || "-"}</td>
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
