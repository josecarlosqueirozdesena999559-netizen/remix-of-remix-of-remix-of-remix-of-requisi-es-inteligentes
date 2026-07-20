import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, FileSignature, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveCanonicalLocationNameFromCandidates,
  type LocationOption,
} from "@/lib/location-normalizer";
import { formatProgramName } from "@/lib/program-options";
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
  saida_vinculada_codigo: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  data: string | null;
  created_at: string;
  status: string;
}

interface RequisicaoDetalhe extends RequisicaoControle {
  localidade: string;
  usuarioNome: string;
}

interface SetorControle {
  nome: string;
  pendencias: number;
  requests: RequisicaoDetalhe[];
}

const pendingStatuses = [
  "aguardando_assinatura",
  "aguardando_assinatura_requisicao",
  "aguardando_assinatura_saida",
  "correcao_requisicao",
] as const;

function isPendingStatus(status: string) {
  return pendingStatuses.includes(status as (typeof pendingStatuses)[number]);
}

function getStatusLabel(status: string) {
  if (status === "aguardando_assinatura") return "Faltando assinatura da requisição";
  if (status === "aguardando_assinatura_requisicao") return "Faltando assinatura da requisição";
  if (status === "aguardando_assinatura_saida") return "Faltando assinatura da saída";
  if (status === "correcao_requisicao") return "Correção da requisição";
  return status || "-";
}

function ControleAssinaturasPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SetorControle[]>([]);
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [selectedSetor, setSelectedSetor] = useState<string | null>(null);
  const [localidadeFilter, setLocalidadeFilter] = useState("");
  const [nomeFilter, setNomeFilter] = useState("");
  const [codigoFilter, setCodigoFilter] = useState("");
  const [saidaFilter, setSaidaFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [{ profile }, usersResult, requestsResult, setoresResult] = await Promise.all([
          getCurrentUserProfile(),
          supabase
            .from("usuarios")
            .select("cpf,nome,setor,unidade_nome")
            .eq("is_admin", false)
            .order("nome", { ascending: true }),
          supabase
            .from("requisicoes")
            .select("id,saida_codigo,saida_vinculada_codigo,setor,solicitante,solicitante_cpf,data,created_at,status")
            .in("status", [...pendingStatuses])
            .order("updated_at", { ascending: false }),
          supabase
            .from("setores")
            .select("nome,programa")
            .order("nome", { ascending: true }),
        ]);

        if (!active) return;

        if (!profile?.is_admin) {
          setError("Apenas administradores podem acessar este controle.");
          return;
        }

        if (usersResult.error || requestsResult.error || setoresResult.error) {
          throw new Error(
            usersResult.error?.message ||
              requestsResult.error?.message ||
              setoresResult.error?.message ||
              "Erro ao carregar controle de assinaturas.",
          );
        }

        const users = (usersResult.data ?? []) as UsuarioBase[];
        const locationOptions = (setoresResult.data ?? []) as LocationOption[];
        const requests = ((requestsResult.data ?? []) as RequisicaoControle[]).filter((request) =>
          isPendingStatus(request.status),
        );
        const codeMap = buildGlobalRequestCodes(requests);
        const bySetor = new Map<string, SetorControle>();

        requests.forEach((request) => {
          const fallbackUser = users.find((user) => user.cpf && user.cpf === request.solicitante_cpf);
          const rawLocalidade = resolveCanonicalLocationNameFromCandidates(
            [
              request.setor?.trim(),
              fallbackUser?.unidade_nome?.trim(),
              fallbackUser?.setor?.trim(),
            ],
            locationOptions,
            "Sem localidade",
          );
          const localidade = formatProgramName(rawLocalidade) || rawLocalidade;
          const usuarioNome =
            request.solicitante?.trim() ||
            fallbackUser?.nome?.trim() ||
            "Usuário sem nome";

          if (!bySetor.has(localidade)) {
            bySetor.set(localidade, {
              nome: localidade,
              pendencias: 0,
              requests: [],
            });
          }

          const current = bySetor.get(localidade);
          if (!current) return;

          current.requests.push({
            ...request,
            localidade,
            usuarioNome,
          });
          current.pendencias += 1;
        });

        const result = Array.from(bySetor.values())
          .map((setor) => ({
            ...setor,
            requests: setor.requests.sort(
              (left, right) =>
                new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
            ),
          }))
          .sort((left, right) => left.nome.localeCompare(right.nome));

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

  const filteredSetores = useMemo(() => {
    const codeQuery = codigoFilter.trim().toLowerCase();
    const saidaQuery = saidaFilter.trim().toLowerCase();

    return data
      .map((setor) => ({
        ...setor,
        requests: setor.requests.filter((request) => {
          const localidadeMatch =
            !localidadeFilter.trim() ||
            setor.nome.toLowerCase().includes(localidadeFilter.trim().toLowerCase());
          const nomeMatch =
            !nomeFilter.trim() ||
            request.usuarioNome.toLowerCase().includes(nomeFilter.trim().toLowerCase());
          const code = (request.saida_codigo || codeByRequestId.get(request.id) || request.id).toLowerCase();
          const linkedOutputCode = (request.saida_vinculada_codigo || "").toLowerCase();
          const codigoMatch = !codeQuery || code.includes(codeQuery);
          const saidaMatch = !saidaQuery || linkedOutputCode.includes(saidaQuery);
          return localidadeMatch && nomeMatch && codigoMatch && saidaMatch;
        }),
      }))
      .filter((setor) => setor.requests.length > 0)
      .map((setor) => ({
        ...setor,
        pendencias: setor.requests.length,
      }));
  }, [codeByRequestId, codigoFilter, data, localidadeFilter, nomeFilter, saidaFilter]);

  const totalPendencias = useMemo(
    () => data.reduce((total, setor) => total + setor.pendencias, 0),
    [data],
  );

  const selectedSetorData = filteredSetores.find((setor) => setor.nome === selectedSetor) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Início / Controle de assinaturas</p>
          <h2 className="text-2xl text-foreground">Controle de assinaturas</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe os setores com requisições aguardando assinatura.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm">
          <FileSignature className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Pendências abertas</span>
          <span className="text-lg leading-none text-foreground">{totalPendencias}</span>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm text-foreground">
          <Search className="h-4 w-4 text-primary" />
          Filtros
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2 text-sm text-muted-foreground">
            Setor
            <Input
              value={localidadeFilter}
              onChange={(event) => setLocalidadeFilter(event.target.value)}
              placeholder="Filtrar por setor"
            />
          </label>
          <label className="space-y-2 text-sm text-muted-foreground">
            Usuário
            <Input
              value={nomeFilter}
              onChange={(event) => setNomeFilter(event.target.value)}
              placeholder="Filtrar por usuário"
            />
          </label>
          <label className="space-y-2 text-sm text-muted-foreground">
            Codigo da requisicao
            <Input
              value={codigoFilter}
              onChange={(event) => setCodigoFilter(event.target.value)}
              placeholder="Filtrar por codigo"
            />
          </label>
          <label className="space-y-2 text-sm text-muted-foreground">
            Codigo da saida
            <Input
              value={saidaFilter}
              onChange={(event) => setSaidaFilter(event.target.value)}
              placeholder="Filtrar por saida"
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
      ) : selectedSetorData ? (
        <Card className="p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Setor selecionado</p>
              <p className="text-xl text-foreground">{selectedSetorData.nome}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="destructive">
                {selectedSetorData.requests.length} pendente{selectedSetorData.requests.length === 1 ? "" : "s"}
              </Badge>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setSelectedSetor(null)}>
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
          </div>

          {selectedSetorData.requests.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhuma requisição pendente encontrada.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-normal">Número</th>
                    <th className="px-4 py-3 text-left font-normal">Usuário</th>
                    <th className="px-4 py-3 text-left font-normal">Data</th>
                    <th className="px-4 py-3 text-left font-normal">Status</th>
                    <th className="px-4 py-3 text-right font-normal">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSetorData.requests.map((request) => {
                    const code = request.saida_codigo || codeByRequestId.get(request.id) || request.id;

                    return (
                      <tr key={request.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 text-foreground">
                          <div>{code}</div>
                          {request.saida_vinculada_codigo ? (
                            <div className="text-xs text-muted-foreground">
                              Saida: {request.saida_vinculada_codigo}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-foreground">{request.usuarioNome}</td>
                        <td className="px-4 py-3 text-muted-foreground">{request.data || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{getStatusLabel(request.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              navigate({
                                to: "/admin/solicitacoes/$requisicaoId/pdf",
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
      ) : filteredSetores.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma pendência encontrada no controle.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSetores.map((setor) => (
            <Card key={setor.nome} className="overflow-hidden transition-shadow hover:shadow-md">
              <button
                type="button"
                onClick={() => setSelectedSetor(setor.nome)}
                className="flex h-full w-full flex-col items-start gap-4 p-5 text-left"
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Setor</p>
                    <h3 className="text-lg text-foreground">{setor.nome}</h3>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {setor.pendencias}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ver requisições pendentes de assinatura neste setor.
                </p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
