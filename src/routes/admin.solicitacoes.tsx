import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  removeAttachmentFile,
  removeAttachmentFileSafely,
  type AttachmentFile,
} from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import {
  isMissingLinkedOutputDateColumnError,
  withLinkedOutputDateFallback,
} from "@/lib/linked-output-date";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import {
  resolveCanonicalLocationNameFromCandidates,
  type LocationOption,
} from "@/lib/location-normalizer";
import { formatProgramName } from "@/lib/program-options";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import type { RequestPdfItem } from "@/lib/request-pdf";
import { notifyRequestByWhatsApp } from "@/lib/whatsapp-edge";

export const Route = createFileRoute("/admin/solicitacoes")({
  component: Solicitacoes,
});

const requestsSelectWithLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,saida_vinculada_data,setor,solicitante,solicitante_cpf,data,created_at,status,items,signed_attachment,admin_attachment,printed_at";
const requestsSelectWithoutLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,items,signed_attachment,admin_attachment,printed_at";

interface Requisicao {
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
  items: RequestPdfItem[] | null;
  signed_attachment: unknown;
  admin_attachment: unknown;
  printed_at: string | null;
  displaySetor?: string;
}

function hasRequestSigned(request: Requisicao) {
  return Boolean(getRequestSignedAttachment(request.signed_attachment, request.status));
}

function hasOutputDocument(request: Requisicao) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
    getAttachmentFile(request.admin_attachment),
  );
}

function normalizeRequestedQuantity(item: RequestPdfItem) {
  const raw = String(item.need ?? item.qtdNecessaria ?? item.quantidade_solicitada ?? "")
    .trim()
    .replace(",", ".");
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function hasRequestItems(request: Requisicao) {
  return (
    Array.isArray(request.items) &&
    request.items.some((item) => normalizeRequestedQuantity(item) > 0)
  );
}

function needsAdminOutput(request: Requisicao) {
  return (
    !hasOutputDocument(request) &&
    (request.status === "recebido" ||
      request.status === "requisicao_assinada" ||
      hasRequestSigned(request))
  );
}

function getTodayInputDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Solicitacoes() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/solicitacoes";
  const [data, setData] = useState<Requisicao[]>();
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [outputCodes, setOutputCodes] = useState<Record<string, string>>({});
  const [outputDates, setOutputDates] = useState<Record<string, string>>({});
  const [stagedFiles, setStagedFiles] = useState<Record<string, File>>({});
  const [confirmedV, setConfirmedV] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<Requisicao | null>(null);
  const [reviewMode, setReviewMode] = useState<"devolver" | "excluir">("devolver");
  const [reviewTarget, setReviewTarget] = useState<"requisicao" | "saida">("requisicao");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [printingRequestId, setPrintingRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const [initialPendingResult, setoresResult] = await Promise.all([
          supabase
            .from("requisicoes")
            .select(requestsSelectWithLinkedOutputDate)
            .in("status", [
              "recebido",
              "requisicao_assinada",
              "concluido",
              "aguardando_assinatura_saida",
            ])
            .order("updated_at", { ascending: false }),
          supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        ]);

        let pendingResult = initialPendingResult;

        if (
          pendingResult.error &&
          isMissingLinkedOutputDateColumnError(pendingResult.error.message)
        ) {
          pendingResult = await supabase
            .from("requisicoes")
            .select(requestsSelectWithoutLinkedOutputDate)
            .in("status", [
              "recebido",
              "requisicao_assinada",
              "concluido",
              "aguardando_assinatura_saida",
            ])
            .order("updated_at", { ascending: false });
        }

        if (!active) return;

        if (pendingResult.error || setoresResult.error) {
          setError(
            pendingResult.error?.message ||
              setoresResult.error?.message ||
              "Erro ao carregar solicitações.",
          );
        } else {
          const requests = withLinkedOutputDateFallback(pendingResult.data) as Requisicao[];
          const locationOptions = (setoresResult.data ?? []) as LocationOption[];
          const cpfs = Array.from(
            new Set(
              requests
                .map((request) => request.solicitante_cpf?.trim())
                .filter((cpf): cpf is string => Boolean(cpf)),
            ),
          );
          const usersByCpf = new Map<
            string,
            { setor: string | null; unidade_nome: string | null }
          >();

          if (cpfs.length > 0) {
            const { data: usersResult, error: usersError } = await supabase
              .from("usuarios")
              .select("cpf,setor,unidade_nome")
              .in("cpf", cpfs);

            if (usersError) {
              setError(usersError.message);
              return;
            }

            (usersResult ?? []).forEach((user) => {
              if (user.cpf) {
                usersByCpf.set(user.cpf, {
                  setor: user.setor ?? null,
                  unidade_nome: user.unidade_nome ?? null,
                });
              }
            });
          }

          const pendingOutputRequests = requests.filter(needsAdminOutput);

          const displayRequests = pendingOutputRequests.map((request) => {
            const displaySetor = resolveCanonicalLocationNameFromCandidates(
              [
                request.setor?.trim(),
                usersByCpf.get(request.solicitante_cpf?.trim() || "")?.unidade_nome?.trim(),
                usersByCpf.get(request.solicitante_cpf?.trim() || "")?.setor?.trim(),
              ],
              locationOptions,
              "Sem setor",
            );

            return {
              ...request,
              status: "recebido",
              displaySetor: formatProgramName(displaySetor) || displaySetor,
            };
          });

          setData(displayRequests);
          setOutputCodes(
            Object.fromEntries(
              displayRequests.map((request) => [request.id, request.saida_vinculada_codigo || ""]),
            ),
          );
          setOutputDates(
            Object.fromEntries(
              displayRequests.map((request) => [
                request.id,
                request.saida_vinculada_data || getTodayInputDate(),
              ]),
            ),
          );
          setCodeByRequestId(buildGlobalRequestCodes(pendingOutputRequests));
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro ao carregar solicitações.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRequests();

    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Requisicao[]>();
    (data ?? []).forEach((r) => {
      const key = r.displaySetor?.trim() || "Sem setor";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (isChildRoute) {
    return <Outlet />;
  }

  const selectedRequests = selected
    ? (grouped.find(([setor]) => setor === selected)?.[1] ?? [])
    : [];

  const handleOutputUpload = async (request: Requisicao, file: File | undefined) => {
    if (!file) return;

    setUploadMessage(null);

    if (!hasRequestItems(request)) {
      setUploadMessage(
        "Esta requisição está sem itens e não pode seguir para a saída. Devolva para ser refeita com os itens corretos.",
      );
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Envie apenas arquivo PDF.");
      return;
    }

    const linkedOutputCode = outputCodes[request.id]?.trim() || null;
    const linkedOutputDate = outputDates[request.id]?.trim() || getTodayInputDate();
    const safeName = sanitizeFileName(file.name) || "saida.pdf";
    const storagePath = `saidas/${request.id}/${Date.now()}-${safeName}`;
    const attachment = {
      fileName: file.name,
      storageBucket: REQUISICOES_BUCKET,
      storagePath,
      uploadedAt: new Date().toISOString(),
      kind: "output" as const,
      outputCode: linkedOutputCode,
      outputDate: linkedOutputDate,
    };

    setUploadingId(request.id);

    try {
      const previousAdminAttachment = getAttachmentFile(
        request.admin_attachment,
      ) as AttachmentFile | null;

      const { error: uploadError } = await supabase.storage
        .from(REQUISICOES_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(
          "Limpe o banco de dados. O limite de memória RAM foi excedido ou troque seu plano.",
        );
      }

      const payload = {
        admin_attachment: attachment,
        saida_vinculada_codigo: linkedOutputCode,
        saida_vinculada_data: linkedOutputDate,
        status: "aguardando_assinatura_saida",
        return_reason: null,
        return_target: null,
        returned_at: null,
      };

      let { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", request.id);

      if (updateError && isMissingLinkedOutputDateColumnError(updateError.message)) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update(omitLinkedOutputDateFields(payload))
          .eq("id", request.id);

        updateError = fallbackUpdate.error;
      }

      if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update(omitReturnFeedbackFields(payload))
          .eq("id", request.id);

        updateError = fallbackUpdate.error;
      }

      if (updateError) throw new Error(updateError.message);

      await removeAttachmentFile(previousAdminAttachment);

      try {
        await notifyRequestByWhatsApp({
          requestId: request.id,
          notificationType: "outputAttached",
        });
      } catch (notificationError) {
        console.error("Erro ao enviar notificação por WhatsApp:", notificationError);
      }

      setData((current) => current?.filter((item) => item.id !== request.id));
      setUploadMessage("Documento de saída enviado pro Almoxarifado com sucesso.");
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Erro ao enviar documento de saída.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>, requestId: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingId((current) => (current === requestId ? null : current));
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, request: Requisicao) => {
    event.preventDefault();
    setDraggingId((current) => (current === request.id ? null : current));
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setStagedFiles((current) => ({ ...current, [request.id]: droppedFile }));
    }
  };

  const openReview = (request: Requisicao, mode: "devolver" | "excluir") => {
    setReviewingRequest(request);
    setReviewMode(mode);
    setReviewTarget(request.status === "aguardando_assinatura_saida" ? "saida" : "requisicao");
    setReviewReason("");
  };

  const closeReview = () => {
    if (reviewSaving) return;
    setReviewingRequest(null);
    setReviewReason("");
  };

  const togglePrinted = async (request: Requisicao, checked: boolean) => {
    if (request.printed_at || !checked) return;

    setPrintingRequestId(request.id);
    setUploadMessage(null);
    setError(null);

    try {
      const printedAt = new Date().toISOString();
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
      setUploadMessage("Marcado como impresso.");
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Erro ao atualizar impressão.");
    } finally {
      setPrintingRequestId(null);
    }
  };

  const submitReview = async () => {
    if (!reviewingRequest) return;

    const reason = reviewReason.trim();
    if (!reason) {
      setUploadMessage("Digite o motivo para continuar.");
      return;
    }

    setReviewSaving(true);
    setUploadMessage(null);

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

      const isSaidaReturn = reviewMode === "devolver" && reviewTarget === "saida";

      const updatedSignedAttachment = isSaidaReturn
        ? buildSignedAttachmentPayload(reviewingRequest.signed_attachment, { output: null })
        : null;

      const payload = {
        status:
          reviewMode === "excluir"
            ? "excluida_admin"
            : isSaidaReturn
              ? "aguardando_assinatura_saida"
              : "correcao_requisicao",
        signed_attachment: updatedSignedAttachment,
        admin_attachment: isSaidaReturn ? reviewingRequest.admin_attachment : null,
        return_reason: reason,
        return_target: isSaidaReturn ? "saida" : "requisicao",
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

      if (!isSaidaReturn) {
        await Promise.all([
          removeAttachmentFileSafely(requestAttachment, "request attachment"),
          removeAttachmentFileSafely(outputAttachment, "output attachment"),
          removeAttachmentFileSafely(adminAttachment, "admin attachment"),
        ]);
      } else {
        await removeAttachmentFileSafely(outputAttachment, "output attachment");
      }

      setData((current) => current?.filter((item) => item.id !== reviewingRequest.id));
      setUploadMessage(
        reviewMode === "devolver"
          ? isSaidaReturn
            ? "Saída devolvida para o solicitante assinar novamente."
            : "Requisição devolvida para correção."
          : "Requisição excluída da fila.",
      );
      closeReview();
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Erro ao revisar requisição.");
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-800">Solicitações Pendentes</h1>
      </div>

      {loading ? (
        <Card className="flex items-center gap-2 p-6 rounded-2xl border-slate-200 bg-white text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Carregando solicitações...
        </Card>
      ) : error ? (
        <Card className="p-6 rounded-2xl border-destructive/40 bg-destructive/10 text-destructive font-medium">
          {error}
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 rounded-2xl border-slate-200 bg-white text-slate-500">
          Nenhuma solicitação pendente.
        </Card>
      ) : selected ? (
        <Card className="p-5 rounded-2xl border-slate-200/80 bg-white shadow-xs">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Local selecionado
              </p>
              <h3 className="text-lg font-bold text-slate-800">{selected}</h3>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-xl"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          {uploadMessage && (
            <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {uploadMessage}
            </p>
          )}

          <div className="rounded-xl overflow-x-auto border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left">Solicitante</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Número</th>
                  <th className="px-4 py-3 text-left">Documento de saída</th>
                  <th className="px-4 py-3 text-center">Impresso</th>
                  <th className="px-4 py-3 text-right">PDF</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {selectedRequests.map((r) => {
                  const code = r.saida_codigo || codeByRequestId.get(r.id) || "-";
                  const missingItems = !hasRequestItems(r);
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{r.solicitante || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{code}</td>
                      <td className="px-3 py-2">
                        <div
                          className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-2 transition-colors ${
                            draggingId === r.id
                              ? "border-emerald-500 bg-emerald-50"
                              : "border-transparent"
                          }`}
                          onDragEnter={() => setDraggingId(r.id)}
                          onDragOver={handleDragOver}
                          onDragLeave={(event) => handleDragLeave(event, r.id)}
                          onDrop={(event) => handleDrop(event, r)}
                        >
                          <Input
                            value={outputCodes[r.id] ?? r.saida_vinculada_codigo ?? ""}
                            onChange={(event) =>
                              setOutputCodes((current) => ({
                                ...current,
                                [r.id]: event.target.value,
                              }))
                            }
                            placeholder="Código da saída"
                            className="h-8 w-40"
                          />
                          <Input
                            type="date"
                            value={
                              outputDates[r.id] ?? r.saida_vinculada_data ?? getTodayInputDate()
                            }
                            onChange={(event) =>
                              setOutputDates((current) => ({
                                ...current,
                                [r.id]: event.target.value,
                              }))
                            }
                            className="h-8 w-36"
                            aria-label="Data da saída"
                          />
                          {getAttachmentFile(r.admin_attachment) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              Enviado
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pendente</span>
                          )}
                          {missingItems && (
                            <span className="text-xs text-destructive">Requisição sem itens</span>
                          )}
                          <input
                            id={`saida-${r.id}`}
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={uploadingId === r.id || missingItems}
                            onChange={(event) => {
                              const picked = event.target.files?.[0];
                              if (picked) {
                                setStagedFiles((current) => ({ ...current, [r.id]: picked }));
                              }
                              event.currentTarget.value = "";
                            }}
                          />

                          {stagedFiles[r.id] ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg truncate max-w-44">
                                📄 {stagedFiles[r.id].name}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirmedV[r.id]) {
                                    setStagedFiles((curr) => {
                                      const next = { ...curr };
                                      delete next[r.id];
                                      return next;
                                    });
                                    setConfirmedV((curr) => {
                                      const next = { ...curr };
                                      delete next[r.id];
                                      return next;
                                    });
                                  } else {
                                    setConfirmedV((curr) => ({ ...curr, [r.id]: true }));
                                  }
                                }}
                                className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center transition-all cursor-pointer ${
                                  confirmedV[r.id]
                                    ? "bg-slate-400 hover:bg-slate-500 text-white"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20"
                                }`}
                                title={
                                  confirmedV[r.id]
                                    ? "Clique para desclicar e remover PDF"
                                    : "Clique no V para reconhecer"
                                }
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                              </button>
                              <Button
                                type="button"
                                size="sm"
                                className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 cursor-pointer"
                                disabled={uploadingId === r.id || missingItems || !confirmedV[r.id]}
                                onClick={() => {
                                  const fileToUpload = stagedFiles[r.id];
                                  if (fileToUpload) {
                                    void handleOutputUpload(r, fileToUpload);
                                    setStagedFiles((current) => {
                                      const next = { ...current };
                                      delete next[r.id];
                                      return next;
                                    });
                                    setConfirmedV((current) => {
                                      const next = { ...current };
                                      delete next[r.id];
                                      return next;
                                    });
                                  }
                                }}
                                title="Enviar pro Almoxarifado"
                              >
                                {uploadingId === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                                Enviar pro Almoxarifado
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`gap-2 rounded-xl ${draggingId === r.id ? "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-100" : ""}`}
                              disabled={uploadingId === r.id || missingItems}
                              onClick={() => document.getElementById(`saida-${r.id}`)?.click()}
                            >
                              {uploadingId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              {getAttachmentFile(r.admin_attachment) ? "Trocar PDF" : "Anexar PDF"}
                            </Button>
                          )}

                          {draggingId === r.id && (
                            <span className="text-xs font-semibold text-emerald-700">
                              Solte o PDF para reconhecer
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.printed_at ? (
                          <div className="flex justify-center">
                            <Checkbox
                              checked
                              disabled
                              aria-label="Documento ja marcado como impresso"
                            />
                          </div>
                        ) : (
                          <div className="flex justify-center">
                            <Checkbox
                              checked={false}
                              disabled={printingRequestId === r.id}
                              onCheckedChange={(checked) => void togglePrinted(r, checked === true)}
                              aria-label="Marcar documento como impresso"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            navigate({
                              to: "/admin/solicitacoes/$requisicaoId/pdf",
                              params: { requisicaoId: r.id },
                            })
                          }
                        >
                          <FileText className="h-4 w-4" />
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
                            onClick={() => openReview(r, "devolver")}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Devolver
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive"
                            onClick={() => openReview(r, "excluir")}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {grouped.map(([setor, items]) => (
            <button
              key={setor}
              type="button"
              onClick={() => setSelected(setor)}
              className="rounded-md border-l-4 border-primary/60 bg-card p-4 text-left transition-colors hover:bg-accent/50"
            >
              <p className="text-foreground">{setor}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? "registro" : "registros"}
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
                ? "O usuário receberá a mesma requisição com os itens para corrigir e reenviar."
                : "A requisição será retirada da fila sem apagar o histórico do banco."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-2">
            {reviewMode === "devolver" && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-normal">O que deseja devolver?</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={reviewTarget === "requisicao" ? "default" : "outline"}
                    className={`text-xs rounded-xl ${
                      reviewTarget === "requisicao"
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                    onClick={() => setReviewTarget("requisicao")}
                  >
                    📝 Devolver Requisição
                  </Button>
                  <Button
                    type="button"
                    variant={reviewTarget === "saida" ? "default" : "outline"}
                    className={`text-xs rounded-xl ${
                      reviewTarget === "saida"
                        ? "bg-rose-600 text-white hover:bg-rose-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                    onClick={() => setReviewTarget("saida")}
                  >
                    📦 Devolver Saída
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-normal">Motivo da Devolução</p>
              <Textarea
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                placeholder={
                  reviewTarget === "saida"
                    ? "Descreva o motivo para o solicitante assinar a saída novamente..."
                    : "Descreva o erro encontrado para o solicitante corrigir..."
                }
                rows={3}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeReview} disabled={reviewSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitReview()} disabled={reviewSaving}>
              {reviewSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {reviewMode === "devolver" ? "Devolver" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
