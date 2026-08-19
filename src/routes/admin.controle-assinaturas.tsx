import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, FileSignature, Loader2, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveCanonicalLocationNameFromCandidates,
  type LocationOption,
} from "@/lib/location-normalizer";
import {
  isMissingLinkedOutputDateColumnError,
  withLinkedOutputDateFallback,
} from "@/lib/linked-output-date";
import { formatProgramName } from "@/lib/program-options";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
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
  saida_vinculada_data: string | null;
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
const pendingRequestsSelectWithLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,saida_vinculada_data,setor,solicitante,solicitante_cpf,data,created_at,status";
const pendingRequestsSelectWithoutLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,setor,solicitante,solicitante_cpf,data,created_at,status";

function isPendingStatus(status: string) {
  return pendingStatuses.includes(status as (typeof pendingStatuses)[number]);
}

function getStatusLabel(status: string) {
  if (status === "aguardando_assinatura") return "Faltando assinatura da solicitação";
  if (status === "aguardando_assinatura_requisicao") return "Faltando assinatura da solicitação";
  if (status === "aguardando_assinatura_saida") return "Faltando assinatura da saída do SIG";
  if (status === "correcao_requisicao") return "Correção da solicitação";
  return status || "-";
}

function formatOutputDate(value: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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
  const [message, setMessage] = useState<string | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<RequisicaoDetalhe | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [{ profile }, usersResult, initialRequestsResult, setoresResult] = await Promise.all([
          getCurrentUserProfile(),
          supabase
            .from("usuarios")
            .select("cpf,nome,setor,unidade_nome")
            .eq("is_admin", false)
            .order("nome", { ascending: true }),
          supabase
            .from("requisicoes")
            .select(pendingRequestsSelectWithLinkedOutputDate)
            .in("status", [...pendingStatuses])
            .order("updated_at", { ascending: false }),
          supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        ]);

        let requestsResult = initialRequestsResult;

        if (
          requestsResult.error &&
          isMissingLinkedOutputDateColumnError(requestsResult.error.message)
        ) {
          requestsResult = await supabase
            .from("requisicoes")
            .select(pendingRequestsSelectWithoutLinkedOutputDate)
            .in("status", [...pendingStatuses])
            .order("updated_at", { ascending: false });
        }

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
        const requests = (
          withLinkedOutputDateFallback(requestsResult.data) as RequisicaoControle[]
        ).filter((request) => isPendingStatus(request.status));
        const codeMap = buildGlobalRequestCodes(requests);
        const bySetor = new Map<string, SetorControle>();

        requests.forEach((request) => {
          const fallbackUser = users.find(
            (user) => user.cpf && user.cpf === request.solicitante_cpf,
          );
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
            request.solicitante?.trim() || fallbackUser?.nome?.trim() || "Usuário sem nome";

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
          setError(
            err instanceof Error ? err.message : "Erro ao carregar controle de assinaturas.",
          );
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
          const code = (
            request.saida_codigo ||
            codeByRequestId.get(request.id) ||
            request.id
          ).toLowerCase();
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

  const closeDeleteDialog = () => {
    if (deleteSaving) return;
    setDeletingRequest(null);
    setDeleteReason("");
  };

  const removeRequestFromData = (requestId: string) => {
    setData((current) =>
      current
        .map((setor) => {
          const requests = setor.requests.filter((request) => request.id !== requestId);

          return {
            ...setor,
            requests,
            pendencias: requests.length,
          };
        })
        .filter((setor) => setor.requests.length > 0),
    );
  };

  const submitDelete = async () => {
    if (!deletingRequest) return;

    const reason = deleteReason.trim();
    if (!reason) {
      setMessage("Digite o motivo para excluir.");
      return;
    }

    setDeleteSaving(true);
    setMessage(null);
    setError(null);

    try {
      const payload = {
        status: "excluida_admin",
        return_reason: reason,
        return_target: "requisicao",
        returned_at: new Date().toISOString(),
      };

      let { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", deletingRequest.id);

      if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update(omitReturnFeedbackFields(payload))
          .eq("id", deletingRequest.id);

        updateError = fallbackUpdate.error;
      }

      if (updateError) throw new Error(updateError.message);

      removeRequestFromData(deletingRequest.id);
      setMessage("Solicitação excluída do controle de assinaturas.");
      closeDeleteDialog();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao excluir solicitação.");
    } finally {
      setDeleteSaving(false);
    }
  };

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
        <div className="flex items-center gap-2 rounded-md border border-orange-200/80 bg-orange-50 px-4 py-3 text-sm">
          <FileSignature className="h-4 w-4 text-orange-600" />
          <span className="text-orange-700">Pendências abertas</span>
          <span className="text-lg leading-none text-orange-900">{totalPendencias}</span>
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
            Solicitação
            <Input
              value={codigoFilter}
              onChange={(event) => setCodigoFilter(event.target.value)}
              placeholder="Filtrar por solicitação"
            />
          </label>
          <label className="space-y-2 text-sm text-muted-foreground">
            Código da saída
            <Input
              value={saidaFilter}
              onChange={(event) => setSaidaFilter(event.target.value)}
              placeholder="Filtrar por saída do SIG"
            />
          </label>
        </div>
      </Card>

      {message ? <Card className="p-4 text-sm text-muted-foreground">{message}</Card> : null}

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
              <Badge className="border border-orange-200 bg-orange-100 text-orange-800 hover:bg-orange-100">
                {selectedSetorData.requests.length} pendente
                {selectedSetorData.requests.length === 1 ? "" : "s"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setSelectedSetor(null)}
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </div>
          </div>

          {selectedSetorData.requests.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nenhuma requisição pendente encontrada.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-normal">Número</th>
                    <th className="px-4 py-3 text-left font-normal">Usuário</th>
                    <th className="px-4 py-3 text-left font-normal">Data</th>
                    <th className="px-4 py-3 text-left font-normal">Status</th>
                    <th className="px-4 py-3 text-right font-normal">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSetorData.requests.map((request) => {
                    const code =
                      request.saida_codigo || codeByRequestId.get(request.id) || request.id;

                    return (
                      <tr key={request.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 text-foreground">
                          <div>{code}</div>
                          {request.saida_vinculada_codigo ? (
                            <div className="text-xs text-muted-foreground">
                              Saida: {request.saida_vinculada_codigo}
                              {request.saida_vinculada_data
                                ? ` - ${formatOutputDate(request.saida_vinculada_data)}`
                                : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-foreground">{request.usuarioNome}</td>
                        <td className="px-4 py-3 text-muted-foreground">{request.data || "-"}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {getStatusLabel(request.status)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
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
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 text-destructive"
                              onClick={() => {
                                setDeletingRequest(request);
                                setDeleteReason("");
                                setMessage(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </Button>
                          </div>
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

      <Dialog open={Boolean(deletingRequest)} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir solicitação</DialogTitle>
            <DialogDescription>
              A solicitação será retirada do controle de assinaturas sem apagar o histórico do
              banco.
            </DialogDescription>
          </DialogHeader>

          {deletingRequest ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-foreground">
                {deletingRequest.saida_codigo ||
                  codeByRequestId.get(deletingRequest.id) ||
                  deletingRequest.id}
              </div>
              <div className="text-muted-foreground">{deletingRequest.usuarioNome}</div>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Motivo</p>
            <Textarea
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              placeholder="Descreva o motivo da exclusão"
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteDialog}
              disabled={deleteSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitDelete()} disabled={deleteSaving}>
              {deleteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
