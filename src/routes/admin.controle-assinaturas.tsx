import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getAttachmentFile, getOutputSignedAttachment } from "@/lib/attachments";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/controle-assinaturas")({
  component: ControleAssinaturasPage,
});

interface UsuarioBase {
  cpf: string | null;
  nome: string;
  setor: string | null;
  unidade_nome: string | null;
}

interface RequisicaoControle {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
}

interface UsuarioControle {
  id: string;
  cpf: string | null;
  nome: string;
  localidade: string;
  pendencias: number;
  requests: RequisicaoControle[];
}

const pendingStatuses = [
  "aguardando_assinatura",
  "aguardando_assinatura_requisicao",
  "aguardando_assinatura_saida",
  "correcao_requisicao",
] as const;

function hasOutputDocument(request: RequisicaoControle) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
}

function isPendingStatus(status: string) {
  return pendingStatuses.includes(status as (typeof pendingStatuses)[number]);
}

function isVisibleForControl(request: RequisicaoControle) {
  if (isPendingStatus(request.status)) return true;
  return request.status === "concluido" && hasOutputDocument(request);
}

function getStatusLabel(status: string) {
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  if (status === "aguardando_assinatura_requisicao") return "Aguardando assinatura";
  if (status === "aguardando_assinatura_saida") return "Saida enviada";
  if (status === "correcao_requisicao") return "Devolvida para correcao";
  if (status === "concluido") return "Concluida";
  return status || "-";
}

function getUserKey(cpf?: string | null, nome?: string | null, localidade?: string | null) {
  return [cpf || "sem-cpf", nome || "sem-nome", localidade || "sem-localidade"].join("|");
}

function ControleAssinaturasPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<UsuarioControle[]>([]);
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [localidadeFilter, setLocalidadeFilter] = useState("");
  const [nomeFilter, setNomeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [{ profile }, usersResult, requestsResult, allRequestsResult] = await Promise.all([
          getCurrentUserProfile(),
          supabase
            .from("usuarios")
            .select("cpf,nome,setor,unidade_nome")
            .eq("is_admin", false)
            .order("nome", { ascending: true }),
          supabase
            .from("requisicoes")
            .select("id,saida_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,signed_attachment,admin_attachment")
            .in("status", [...pendingStatuses, "concluido"])
            .order("created_at", { ascending: false }),
          supabase
            .from("requisicoes")
            .select("id,saida_codigo,data,created_at")
            .order("created_at", { ascending: true }),
        ]);

        if (!active) return;

        if (!profile?.is_admin) {
          setError("Apenas administradores podem acessar este controle.");
          return;
        }

        if (usersResult.error || requestsResult.error || allRequestsResult.error) {
          throw new Error(
            usersResult.error?.message ||
              requestsResult.error?.message ||
              allRequestsResult.error?.message ||
              "Erro ao carregar controle de assinaturas.",
          );
        }

        const users = (usersResult.data ?? []) as UsuarioBase[];
        const requests = ((requestsResult.data ?? []) as RequisicaoControle[]).filter(isVisibleForControl);
        const codeMap = buildGlobalRequestCodes((allRequestsResult.data ?? []) as RequisicaoControle[]);
        const byUser = new Map<string, UsuarioControle>();

        users.forEach((user) => {
          const localidade = user.unidade_nome?.trim() || user.setor?.trim() || "Sem localidade";
          const key = getUserKey(user.cpf, user.nome, localidade);
          byUser.set(key, {
            id: key,
            cpf: user.cpf,
            nome: user.nome,
            localidade,
            pendencias: 0,
            requests: [],
          });
        });

        requests.forEach((request) => {
          const fallbackUser = users.find((user) => user.cpf && user.cpf === request.solicitante_cpf);
          const localidade =
            request.setor?.trim() ||
            fallbackUser?.unidade_nome?.trim() ||
            fallbackUser?.setor?.trim() ||
            "Sem localidade";
          const nome =
            request.solicitante?.trim() ||
            fallbackUser?.nome?.trim() ||
            "Usuario sem nome";
          const key = getUserKey(request.solicitante_cpf, nome, localidade);

          if (!byUser.has(key)) {
            byUser.set(key, {
              id: key,
              cpf: request.solicitante_cpf,
              nome,
              localidade,
              pendencias: 0,
              requests: [],
            });
          }

          const current = byUser.get(key);
          if (!current) return;

          current.requests.push(request);
          if (isPendingStatus(request.status)) {
            current.pendencias += 1;
          }
        });

        const result = Array.from(byUser.values())
          .filter((user) => user.requests.length > 0 || user.pendencias > 0)
          .sort(
            (left, right) =>
              left.localidade.localeCompare(right.localidade) ||
              left.nome.localeCompare(right.nome),
          );

        setData(result);
        setCodeByRequestId(codeMap);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro ao carregar controle de assinaturas.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    return data.filter((user) => {
      const localidadeMatch =
        !localidadeFilter.trim() ||
        user.localidade.toLowerCase().includes(localidadeFilter.trim().toLowerCase());
      const nomeMatch =
        !nomeFilter.trim() || user.nome.toLowerCase().includes(nomeFilter.trim().toLowerCase());
      return localidadeMatch && nomeMatch;
    });
  }, [data, localidadeFilter, nomeFilter]);

  const groupedUsers = useMemo(() => {
    const map = new Map<string, UsuarioControle[]>();
    filteredUsers.forEach((user) => {
      const key = user.localidade || "Sem localidade";
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(user);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredUsers]);

  const selectedUser = data.find((user) => user.id === selectedUserId) || null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Inicio / Controle de assinaturas</p>
        <h2 className="text-2xl text-foreground">Controle de assinaturas</h2>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm text-muted-foreground">
            Localidade
            <Input
              value={localidadeFilter}
              onChange={(event) => setLocalidadeFilter(event.target.value)}
              placeholder="Filtrar por localidade"
            />
          </label>
          <label className="space-y-2 text-sm text-muted-foreground">
            Nome
            <Input
              value={nomeFilter}
              onChange={(event) => setNomeFilter(event.target.value)}
              placeholder="Filtrar por nome"
            />
          </label>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando controle...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : selectedUser ? (
        <Card className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Usuario selecionado</p>
              <p className="text-lg text-foreground">{selectedUser.nome}</p>
              <p className="text-sm text-muted-foreground">{selectedUser.localidade}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={selectedUser.pendencias > 0 ? "destructive" : "secondary"}>
                {selectedUser.pendencias} pendente{selectedUser.pendencias === 1 ? "" : "s"}
              </Badge>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setSelectedUserId(null)}>
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
          </div>

          {selectedUser.requests.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma requisicao encontrada.</div>
          ) : (
            <div className="rounded-md overflow-x-auto border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Data</th>
                    <th className="px-3 py-2 text-left font-normal">Local</th>
                    <th className="px-3 py-2 text-left font-normal">Numero</th>
                    <th className="px-3 py-2 text-left font-normal">Status</th>
                    <th className="px-3 py-2 text-right font-normal">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedUser.requests.map((request) => {
                    const code = request.saida_codigo || codeByRequestId.get(request.id) || request.id;
                    const pdfRoute = hasOutputDocument(request)
                      ? "/admin/assinadas/$requisicaoId/pdf"
                      : "/admin/solicitacoes/$requisicaoId/pdf";

                    return (
                      <tr key={request.id} className="border-t">
                        <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                        <td className="px-3 py-2 text-foreground">{request.setor || selectedUser.localidade}</td>
                        <td className="px-3 py-2 text-foreground">{code}</td>
                        <td className="px-3 py-2 text-muted-foreground">{getStatusLabel(request.status)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              navigate({
                                to: pdfRoute,
                                params: { requisicaoId: request.id },
                              })
                            }
                          >
                            <Eye className="h-4 w-4" />
                            Ver/Baixar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : groupedUsers.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhum registro encontrado no controle.</Card>
      ) : (
        groupedUsers.map(([localidade, users]) => (
          <Card key={localidade} className="p-4">
            <div className="mb-3">
              <p className="text-sm text-muted-foreground">Localidade</p>
              <h3 className="text-lg text-foreground">{localidade}</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className="rounded-md border p-4 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base text-foreground">{user.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.requests.length} registro{user.requests.length === 1 ? "" : "s"} no controle
                      </p>
                    </div>
                    <Badge variant={user.pendencias > 0 ? "destructive" : "secondary"}>
                      {user.pendencias}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
