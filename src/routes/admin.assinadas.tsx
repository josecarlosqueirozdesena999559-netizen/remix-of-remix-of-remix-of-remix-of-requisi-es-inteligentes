import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Eye, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  type AttachmentFile,
} from "@/lib/attachments";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
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

type ReviewMode = "devolver" | "excluir";
type ReviewTarget = "requisicao" | "saida";

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
  if (status === "concluido") return "Concluída";
  if (status === "requisicao_assinada") return "Requisição assinada";
  if (status === "recebido") return "Requisição assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saída";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
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
    const { data, error } = await supabase
      .from("requisicoes")
      .select(
        "id,saida_codigo,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment",
      )
      .eq("status", "concluido")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as RequisicaoAssinada[];
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
  const [reviewingRequest, setReviewingRequest] = useState<RequisicaoAssinada | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("devolver");
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>("saida");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);

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
          setError(setoresResult.error?.message || "Erro ao carregar requisições.");
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
    ? (grouped.find(([local]) => local === selected)?.[1] ?? [])
    : [];

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
          await Promise.all([
            removeAttachmentFile(requestAttachment),
            removeAttachmentFile(outputAttachment),
            removeAttachmentFile(adminAttachment),
          ]);

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

          setMessage("Requisição devolvida para correção do usuário.");
        } else {
          await Promise.all([
            removeAttachmentFile(outputAttachment),
            removeAttachmentFile(adminAttachment),
          ]);

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

          setMessage("Saída devolvida para ajuste do admin.");
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

        setMessage("Requisição excluída da fila.");
      }

      setData((current) => current?.filter((item) => item.id !== reviewingRequest.id));
      closeReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar requisição.");
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
        <Card className="p-6 text-muted-foreground">Nenhuma requisição encontrada neste mês.</Card>
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
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Usuário</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Ações</th>
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
                      <td className="px-3 py-2 text-foreground">{code}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <Card className="bg-muted/30 p-6">
            <p className="text-sm text-muted-foreground">Primeiro passo</p>
            <p className="text-lg text-foreground">Escolha o local para conferir os PDFs do mês</p>
          </Card>

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
        </>
      )}

      <Dialog open={Boolean(reviewingRequest)} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewMode === "devolver" ? "Devolver requisição" : "Excluir requisição"}
            </DialogTitle>
            <DialogDescription>
              {reviewMode === "devolver"
                ? "Escolha se o erro está na requisição ou na saída para enviar o fluxo de volta ao ponto correto."
                : "A requisição sairá da fila, mas o histórico e o motivo ficam registrados no banco."}
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
                      A saída volta para pendente e a requisição assinada continua preservada.
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
