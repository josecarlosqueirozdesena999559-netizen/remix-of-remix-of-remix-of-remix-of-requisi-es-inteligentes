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
  if (status === "concluido") return "Concluida";
  if (status === "requisicao_assinada") return "Requisicao assinada";
  if (status === "recebido") return "Requisicao assinada";
  if (status === "aguardando_assinatura_saida") return "Aguardando saida";
  if (status === "aguardando_assinatura") return "Aguardando assinatura";
  return status || "-";
}

function hasOutputDocument(request: RequisicaoAssinada) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
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

      const [requestsResult, allResult] = await Promise.all([
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,solicitante,data,created_at,status,signed_attachment,admin_attachment")
          .order("created_at", { ascending: false }),
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (requestsResult.error || allResult.error) {
        setError(requestsResult.error?.message || allResult.error?.message || "Erro ao carregar requisicoes.");
      } else {
        const requests = (requestsResult.data ?? []) as RequisicaoAssinada[];

        setData(
          requests.filter(
            (request) => request.status === "concluido" && hasOutputDocument(request),
          ),
        );
        setCodeByRequestId(buildGlobalRequestCodes((allResult.data ?? []) as RequisicaoAssinada[]));
      }

      setLoading(false);
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
    ? grouped.find(([local]) => local === selected)?.[1] ?? []
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
      const requestAttachment = getRequestSignedAttachment(reviewingRequest.signed_attachment, reviewingRequest.status);
      const outputAttachment = getOutputSignedAttachment(reviewingRequest.signed_attachment, reviewingRequest.status);
      const adminAttachment = getAttachmentFile(reviewingRequest.admin_attachment) as AttachmentFile | null;

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

          setMessage("Requisicao devolvida para correcao do usuario.");
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
        <p className="text-sm text-muted-foreground">Inicio / Assinadas</p>
        <h2 className="text-2xl text-foreground">Requisicoes assinadas</h2>
      </div>

      <Card className="p-4">
        <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
          Mes
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
        <Card className="p-6 text-muted-foreground">Nenhuma requisicao encontrada neste mes.</Card>
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
                  <th className="px-3 py-2 text-left font-normal">Usuario</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Numero</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {selectedRequests.map((request) => {
                  const code = request.saida_codigo || codeByRequestId.get(request.id) || "-";
                  const requestAttachment = getRequestSignedAttachment(request.signed_attachment, request.status);
                  const outputAttachment =
                    getOutputSignedAttachment(request.signed_attachment, request.status) ||
                    getAttachmentFile(request.admin_attachment);
                  const hasPdf = Boolean(requestAttachment || outputAttachment);

                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{request.solicitante || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{code}</td>
                      <td className="px-3 py-2 text-muted-foreground">{getStatusLabel(request.status)}</td>
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
            <p className="text-lg text-foreground">Escolha o local para conferir os PDFs do mes</p>
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
            <DialogTitle>{reviewMode === "devolver" ? "Devolver requisicao" : "Excluir requisicao"}</DialogTitle>
            <DialogDescription>
              {reviewMode === "devolver"
                ? "Escolha se o erro esta na requisicao ou na saida para enviar o fluxo de volta ao ponto correto."
                : "A requisicao saira da fila, mas o historico e o motivo ficam registrados no banco."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Onde esta o erro?</p>
              <RadioGroup
                value={reviewTarget}
                onValueChange={(value) => setReviewTarget(value as ReviewTarget)}
                className="gap-3"
              >
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="requisicao" id="review-target-requisicao" />
                  <span className="space-y-1">
                    <Label htmlFor="review-target-requisicao">Erro na requisicao</Label>
                    <span className="block text-xs text-muted-foreground">
                      O usuario recebe a mesma requisicao com os itens para corrigir e reenviar.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="saida" id="review-target-saida" />
                  <span className="space-y-1">
                    <Label htmlFor="review-target-saida">Erro na saida</Label>
                    <span className="block text-xs text-muted-foreground">
                      A saida volta para pendente e a requisicao assinada continua preservada.
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
              {reviewMode === "devolver" ? "Confirmar devolucao" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
