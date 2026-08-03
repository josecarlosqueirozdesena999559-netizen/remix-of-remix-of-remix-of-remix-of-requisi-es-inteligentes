import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Download, Eye, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSignedAttachmentPayload,
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  removeAttachmentFile,
  removeAttachmentFileSafely,
  type AttachmentFile,
} from "@/lib/attachments";
import {
  formatOutputDate,
  isMissingLinkedOutputDateColumnError,
  withLinkedOutputDateFallback,
} from "@/lib/linked-output-date";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import { getRequestArchiveMonth } from "@/lib/request-archive-month";
import { downloadSignedRequestsMonthlyPdf } from "@/lib/signed-requests-monthly-pdf";

export const Route = createFileRoute("/admin/assinadas")({
  component: AssinadasPage,
});

const completedRequestsSelectWithLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,saida_vinculada_data,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment,printed_at";
const completedRequestsSelectWithoutLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment,printed_at";

interface RequisicaoAssinada {
  id: string;
  saida_codigo: string | null;
  saida_vinculada_codigo: string | null;
  saida_vinculada_data: string | null;
  setor: string | null;
  solicitante: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
  printed_at: string | null;
}

type ReviewMode = "devolver" | "excluir";
type ReviewTarget = "requisicao" | "saida";

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getStatusLabel(status: string) {
  if (status === "concluido") return "Concluida";
  if (status === "requisicao_assinada") return "Requisição assinada";
  if (status === "recebido") return "Requisicao assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saida";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
}

function parseOutputDateToTimestamp(value: string | null | undefined): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function getOutputDateTime(request: RequisicaoAssinada) {
  return (
    parseOutputDateToTimestamp(request.saida_vinculada_data) ||
    parseOutputDateToTimestamp(request.data) ||
    parseOutputDateToTimestamp(request.created_at)
  );
}

function hasOutputDocument(request: RequisicaoAssinada) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
    getAttachmentFile(request.admin_attachment),
  );
}

async function fetchCompletedRequests() {
  const pageSize = 1000;
  let from = 0;
  const requests: RequisicaoAssinada[] = [];

  while (true) {
    let { data, error } = await supabase
      .from("requisicoes")
      .select(completedRequestsSelectWithLinkedOutputDate)
      .eq("status", "concluido")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error && isMissingLinkedOutputDateColumnError(error.message)) {
      const fallbackResult = await supabase
        .from("requisicoes")
        .select(completedRequestsSelectWithoutLinkedOutputDate)
        .eq("status", "concluido")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw new Error(error.message);

    const page = withLinkedOutputDateFallback(data) as RequisicaoAssinada[];
    requests.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return requests;
}

function AssinadasPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/assinadas";
  const [data, setData] = useState<RequisicaoAssinada[]>();
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [codigoFilter, setCodigoFilter] = useState("");
  const [saidaFilter, setSaidaFilter] = useState("");
  const [reviewingRequest, setReviewingRequest] = useState<RequisicaoAssinada | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("devolver");
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>("saida");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [printingRequestId, setPrintingRequestId] = useState<string | null>(null);
  const [downloadingMonthlyPdf, setDownloadingMonthlyPdf] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [requests, setoresResult] = await Promise.all([
          fetchCompletedRequests(),
          supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        ]);

        if (!active) return;

        if (setoresResult.error) {
          setError(setoresResult.error.message || "Erro ao carregar requisicoes.");
        } else {
          const locationOptions = (setoresResult.data ?? []) as LocationOption[];

          setData(
            requests
              .filter((request) => request.status === "concluido" && hasOutputDocument(request))
              .map((request) => ({
                ...request,
                setor:
                  resolveCanonicalLocationName(request.setor, locationOptions) || request.setor,
              })),
          );
          setCodeByRequestId(buildGlobalRequestCodes(requests));
        }
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

  const hasCodeSearch = Boolean(codigoFilter.trim() || saidaFilter.trim());

  const filteredData = useMemo(() => {
    const codeQuery = codigoFilter.trim().toLowerCase();
    const saidaQuery = saidaFilter.trim().toLowerCase();

    return (data ?? [])
      .filter((request) => {
        if (!hasCodeSearch && getRequestArchiveMonth(request) !== selectedMonth) return false;

        const code = (request.saida_codigo || codeByRequestId.get(request.id) || "-").toLowerCase();
        const linkedOutputCode = (request.saida_vinculada_codigo || "").toLowerCase();
        const codigoMatch = !codeQuery || code.includes(codeQuery);
        const saidaMatch = !saidaQuery || linkedOutputCode.includes(saidaQuery);
        return codigoMatch && saidaMatch;
      })
      .sort((left, right) => getOutputDateTime(right) - getOutputDateTime(left));
  }, [codeByRequestId, codigoFilter, data, hasCodeSearch, saidaFilter, selectedMonth]);

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
    ? (grouped.find(([local]) => local === selected)?.[1] ?? [])
    : [];

  const downloadMonthlyPdf = async () => {
    if (filteredData.length === 0) return;

    setDownloadingMonthlyPdf(true);
    setMessage(null);
    setError(null);

    try {
      await downloadSignedRequestsMonthlyPdf(
        selectedMonth,
        filteredData.map((request) => ({
          code: request.saida_codigo || codeByRequestId.get(request.id) || "-",
          requester: request.solicitante || "-",
          location: request.setor || "Sem local",
          requestDate: request.data || "-",
        })),
      );
      setMessage("PDF mensal gerado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar PDF mensal.");
    } finally {
      setDownloadingMonthlyPdf(false);
    }
  };

  const openReview = (request: RequisicaoAssinada, mode: ReviewMode) => {
    setReviewingRequest(request);
    setReviewMode(mode);
    setReviewTarget("saida");
    setReviewReason("");
  };

  const closeReview = () => {
    if (reviewSaving) return;
    setReviewingRequest(null);
    setReviewReason("");
    setReviewTarget("saida");
  };

  const togglePrinted = async (request: RequisicaoAssinada, checked: boolean) => {
    if (request.printed_at || !checked) return;

    setPrintingRequestId(request.id);
    setMessage(null);
    setError(null);

    try {
      const printedAt = checked ? new Date().toISOString() : null;
      const { error: updateError } = await supabase
        .from("requisicoes")
        .update({ printed_at: printedAt })
        .eq("id", request.id);

      if (updateError) throw new Error(updateError.message);

      setData((current) =>
        current?.map((item) =>
          item.id === request.id ? { ...item, printed_at: printedAt } : item,
        ),
      );
      setMessage("Documento verificado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar arquivamento.");
    } finally {
      setPrintingRequestId(null);
    }
  };

  const submitReview = async () => {
    if (!reviewingRequest) return;

    const reason = reviewReason.trim();
    if (!reason) {
      setMessage("Digite o motivo para continuar.");
      return;
    }

    setReviewSaving(true);
    setMessage(null);
    setError(null);

    try {
      const requestAttachment = getRequestSignedAttachment(
        reviewingRequest.signed_attachment,
        reviewingRequest.status,
      );
      const outputAttachment = getOutputSignedAttachment(
        reviewingRequest.signed_attachment,
        reviewingRequest.status,
      );
      const adminAttachment = getAttachmentFile(
        reviewingRequest.admin_attachment,
      ) as AttachmentFile | null;

      if (reviewMode === "devolver") {
        if (reviewTarget === "requisicao") {
          const payload = {
            status: "correcao_requisicao",
            signed_attachment: null,
            admin_attachment: null,
            return_reason: reason,
            return_target: "requisicao",
            returned_at: new Date().toISOString(),
          };

          let { error: updateError } = await supabase
            .from("requisicoes")
            .update(payload)
            .eq("id", reviewingRequest.id);

          if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
            const fallbackUpdate = await supabase
              .from("requisicoes")
              .update(omitReturnFeedbackFields(payload))
              .eq("id", reviewingRequest.id);

            updateError = fallbackUpdate.error;
          }

          if (updateError) throw new Error(updateError.message);

          await Promise.all([
            removeAttachmentFileSafely(requestAttachment, "request attachment"),
            removeAttachmentFileSafely(outputAttachment, "output attachment"),
            removeAttachmentFileSafely(adminAttachment, "admin attachment"),
          ]);

          setMessage("Requisicao devolvida para correcao do usuario.");
        } else {
          const payload = {
            status: "recebido",
            signed_attachment: buildSignedAttachmentPayload(reviewingRequest.signed_attachment, {
              output: null,
            }),
            admin_attachment: null,
            return_reason: reason,
            return_target: "saida",
            returned_at: new Date().toISOString(),
          };

          let { error: updateError } = await supabase
            .from("requisicoes")
            .update(payload)
            .eq("id", reviewingRequest.id);

          if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
            const fallbackUpdate = await supabase
              .from("requisicoes")
              .update(omitReturnFeedbackFields(payload))
              .eq("id", reviewingRequest.id);

            updateError = fallbackUpdate.error;
          }

          if (updateError) throw new Error(updateError.message);

          await Promise.all([
            removeAttachmentFileSafely(outputAttachment, "output attachment"),
            removeAttachmentFileSafely(adminAttachment, "admin attachment"),
          ]);

          setMessage("Saida devolvida para ajuste do admin.");
        }
      } else {
        await Promise.all([
          removeAttachmentFile(requestAttachment),
          removeAttachmentFile(outputAttachment),
          removeAttachmentFile(adminAttachment),
        ]);

        const payload = {
          status: "excluida_admin",
          signed_attachment: null,
          admin_attachment: null,
          return_reason: reason,
          return_target: reviewTarget,
          returned_at: new Date().toISOString(),
        };

        let { error: updateError } = await supabase
          .from("requisicoes")
          .update(payload)
          .eq("id", reviewingRequest.id);

        if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
          const fallbackUpdate = await supabase
            .from("requisicoes")
            .update(omitReturnFeedbackFields(payload))
            .eq("id", reviewingRequest.id);

          updateError = fallbackUpdate.error;
        }

        if (updateError) throw new Error(updateError.message);

        setMessage("Requisicao excluida da fila.");
      }

      setData((current) => current?.filter((item) => item.id !== reviewingRequest.id));
      closeReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar requisicao.");
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Início / Assinadas</p>
        <h2 className="text-2xl text-foreground">Requisições assinadas</h2>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
              Mês
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
            <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
              Solicitação
              <Input
                value={codigoFilter}
                onChange={(event) => {
                  setCodigoFilter(event.target.value);
                  setSelected(null);
                }}
                placeholder="Filtrar por solicitação"
              />
            </label>
            <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
              Código da saída
              <Input
                value={saidaFilter}
                onChange={(event) => {
                  setSaidaFilter(event.target.value);
                  setSelected(null);
                }}
                placeholder="Filtrar por saida"
              />
            </label>
          </div>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={loading || filteredData.length === 0 || downloadingMonthlyPdf}
            onClick={() => void downloadMonthlyPdf()}
          >
            {downloadingMonthlyPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar PDF do mês
          </Button>
        </div>
      </Card>

      {message && <Card className="p-4 text-sm text-muted-foreground">{message}</Card>}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          {hasCodeSearch
            ? "Nenhuma requisicao encontrada para este codigo."
            : "Nenhuma requisicao encontrada neste mes."}
        </Card>
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

          <div className="overflow-x-auto rounded-md border">
            {selectedRequests.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Nenhum documento visível neste local com o filtro atual.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Usuário</th>
                    <th className="px-3 py-2 text-left font-normal">Data</th>
                    <th className="px-3 py-2 text-left font-normal">Número</th>
                    <th className="px-3 py-2 text-left font-normal">Data saída</th>
                    <th className="px-3 py-2 text-left font-normal">Status</th>
                    <th className="px-3 py-2 text-right font-normal">PDF</th>
                    <th className="px-3 py-2 text-right font-normal">Ações</th>
                    <th className="px-3 py-2 text-left font-normal">Verificado</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRequests.map((request) => {
                    const code = request.saida_codigo || codeByRequestId.get(request.id) || "-";
                    const requestAttachment = getRequestSignedAttachment(
                      request.signed_attachment,
                      request.status,
                    );
                    const outputAttachment =
                      getOutputSignedAttachment(request.signed_attachment, request.status) ||
                      getAttachmentFile(request.admin_attachment);
                    const hasPdf = Boolean(requestAttachment || outputAttachment);

                    return (
                      <tr key={request.id} className="border-t">
                        <td className="px-3 py-2 text-foreground">{request.solicitante || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                        <td className="px-3 py-2 text-foreground">
                          <div>{code}</div>
                          {request.saida_vinculada_codigo ? (
                            <div className="text-xs text-muted-foreground">
                              Saida: {request.saida_vinculada_codigo}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatOutputDate(request.saida_vinculada_data) || "-"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {getStatusLabel(request.status)}
                        </td>
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
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => openReview(request, "devolver")}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Devolver
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 text-destructive"
                              onClick={() => openReview(request, "excluir")}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </Button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {request.printed_at ? (
                            <div className="flex items-center gap-2">
                              <Checkbox checked disabled aria-label="Documento ja verificado" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={false}
                                disabled={printingRequestId === request.id}
                                onCheckedChange={(checked) =>
                                  void togglePrinted(request, checked === true)
                                }
                                aria-label="Marcar documento como verificado"
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {grouped.map(([local, requests]) => (
            <button
              key={local}
              type="button"
              onClick={() => setSelected(local)}
              className="rounded-md border-l-4 border-primary/60 bg-card p-4 text-left transition-colors hover:bg-accent/50"
            >
              <p className="text-foreground">{local}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {requests.length} {requests.length === 1 ? "registro" : "registros"}
              </p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={Boolean(reviewingRequest)} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewMode === "devolver" ? "Devolver requisição" : "Excluir requisição"}
            </DialogTitle>
            <DialogDescription>
              {reviewMode === "devolver"
                ? "Escolha se o erro está na requisição ou na saída para devolver o fluxo ao ponto correto."
                : "A requisição sairá da fila, mas o histórico e o motivo ficarão registrados no sistema."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Onde está o erro?</p>
              <RadioGroup
                value={reviewTarget}
                onValueChange={(value) => setReviewTarget(value as ReviewTarget)}
                className="gap-3"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="requisicao" id="review-target-requisicao" />
                  <span className="space-y-1">
                    <Label htmlFor="review-target-requisicao">Erro na requisição</Label>
                    <span className="block text-xs text-muted-foreground">
                      O usuário recebe a mesma requisição com os itens para corrigir e reenviar.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="saida" id="review-target-saida" />
                  <span className="space-y-1">
                    <Label htmlFor="review-target-saida">Erro na saída</Label>
                    <span className="block text-xs text-muted-foreground">
                      A saída volta para pendente, e a requisição assinada continua preservada.
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Motivo</p>
              <Textarea
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                placeholder="Descreva o erro encontrado"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeReview} disabled={reviewSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitReview()} disabled={reviewSaving}>
              {reviewSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {reviewMode === "devolver" ? "Confirmar devolução" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
