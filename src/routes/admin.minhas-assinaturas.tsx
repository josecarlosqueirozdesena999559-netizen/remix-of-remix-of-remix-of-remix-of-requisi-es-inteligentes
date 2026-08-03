import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, CheckCircle2, Eye, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSignedAttachmentPayload,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  removeAttachmentFile,
  type AttachmentFile,
} from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import { formatOutputDate } from "@/lib/linked-output-date";
import { getRequestOwnerCpf, getRequestOwnerLocation } from "@/lib/request-owner";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import type { RequestPdfItem } from "@/lib/request-pdf";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
import { getCurrentUserProfile } from "@/lib/user-profile";
import { notifyRequestByWhatsApp } from "@/lib/whatsapp-edge";

export const Route = createFileRoute("/admin/minhas-assinaturas")({
  component: MinhasAssinaturasPage,
});

const REQUEST_FLASH_KEY = "admin_request_whatsapp_flash";

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  saida_vinculada_codigo?: string | null;
  saida_vinculada_data?: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  data: string | null;
  created_at: string;
  status: string;
  items: RequestPdfItem[] | null;
  signed_attachment: unknown;
  admin_attachment: unknown;
  return_reason: string | null;
  return_target: string | null;
}

const baseSelect =
  "id,saida_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,items,signed_attachment,admin_attachment";

const baseSelectWithOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,saida_vinculada_data,setor,solicitante,solicitante_cpf,data,created_at,status,items,signed_attachment,admin_attachment";

function getStageLabel(status: string) {
  if (status === "aguardando_assinatura_saida") return "Assinar saída";
  if (status === "correcao_requisicao") return "Corrigir requisição";
  return "Assinar requisição";
}

function isRequestSignatureStatus(status: string) {
  return status === "aguardando_assinatura" || status === "aguardando_assinatura_requisicao";
}

function canEditUnsignedRequest(request: Requisicao) {
  return (
    isRequestSignatureStatus(request.status) &&
    !getRequestSignedAttachment(request.signed_attachment, request.status)
  );
}

function needsCurrentStageSignature(request: Requisicao) {
  if (request.status === "aguardando_assinatura_saida") {
    return !getOutputSignedAttachment(request.signed_attachment, request.status);
  }

  if (request.status === "correcao_requisicao") {
    return true;
  }

  if (isRequestSignatureStatus(request.status)) {
    return !getRequestSignedAttachment(request.signed_attachment, request.status);
  }

  return false;
}

function buildRequestDedupKey(request: Requisicao) {
  // Each request must remain visible for signature even before it receives a saída code.
  return request.id;
}

function dedupeRequests(requests: Requisicao[]) {
  const seen = new Set<string>();

  return requests.filter((request) => {
    const key = buildRequestDedupKey(request);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function getSignedPdfUploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "").trim();

  if (!message) return "Não foi possível enviar o PDF assinado. Tente novamente.";

  if (/DOCUMENT_UPLOADS_DISABLED|row-level security|violates row-level security|permission denied|storage/i.test(message)) {
    return "O envio de PDF assinado ainda não está liberado no armazenamento. Atualize a página e tente novamente após a publicação da correção.";
  }

  if (/P0001|database|databate|1000/i.test(message)) {
    return "Não foi possível registrar o PDF assinado no banco. Atualize a página e tente anexar novamente.";
  }

  return message;
}

function shouldBlockSignatureUpload(request: Requisicao) {
  return request.status !== "aguardando_assinatura_saida" && !hasRequestItems(request);
}

async function removeOldAttachment(attachment: AttachmentFile | null | undefined) {
  try {
    await removeAttachmentFile(attachment);
  } catch (error) {
    console.warn("Não foi possível remover anexo antigo.", error);
  }
}

function MinhasAssinaturasPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/minhas-assinaturas";
  const [requests, setRequests] = useState<Requisicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Record<string, File>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const flash = sessionStorage.getItem(REQUEST_FLASH_KEY);
    if (!flash) return;

    setMessage(flash);
    sessionStorage.removeItem(REQUEST_FLASH_KEY);
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError(null);

    try {
      const { profile } = await getCurrentUserProfile();

      const cpf = getRequestOwnerCpf(profile);
      const location = getRequestOwnerLocation(profile);
      const name = profile?.nome?.trim() || "";

      if (!cpf && !(name && location)) {
        setRequests([]);
        return;
      }

      const requestsQuery = supabase
        .from("requisicoes")
        .select(`${baseSelectWithOutputDate},return_reason,return_target`)
        .in("status", [
          "aguardando_assinatura",
          "aguardando_assinatura_requisicao",
          "aguardando_assinatura_saida",
          "correcao_requisicao",
        ])
        .order("updated_at", { ascending: false });

      const fallbackRequestsQuery = supabase
        .from("requisicoes")
        .select(baseSelect)
        .in("status", [
          "aguardando_assinatura",
          "aguardando_assinatura_requisicao",
          "aguardando_assinatura_saida",
        ])
        .order("updated_at", { ascending: false });

      const scopedRequestsQuery = cpf
        ? requestsQuery.eq("solicitante_cpf", cpf)
        : requestsQuery.eq("solicitante", name).eq("setor", location);

      const scopedFallbackQuery = cpf
        ? fallbackRequestsQuery.eq("solicitante_cpf", cpf)
        : fallbackRequestsQuery.eq("solicitante", name).eq("setor", location);

      const [{ data: setoresData, error: setoresError }, requestsResult] = await Promise.all([
        supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        scopedRequestsQuery,
      ]);

      let { data, error } = requestsResult;

      if (setoresError) {
        throw new Error(setoresError.message);
      }

      const locationOptions = (setoresData ?? []) as LocationOption[];

      if (
        error &&
        (isMissingReturnFeedbackColumnError(error.message) ||
          error.message.includes("saida_vinculada_data"))
      ) {
        const fallbackResult = await scopedFallbackQuery;

        data = (fallbackResult.data ?? []).map((request) => ({
          ...request,
          saida_vinculada_codigo: null,
          saida_vinculada_data: null,
          return_reason: null,
          return_target: null,
        }));
        error = fallbackResult.error;
      }

      if (error) throw new Error(error.message);

      setRequests(
        dedupeRequests(
          ((data ?? []) as Requisicao[])
            .map((request) => ({
              ...request,
              setor: resolveCanonicalLocationName(request.setor, locationOptions) || request.setor,
            }))
            .filter(needsCurrentStageSignature),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar assinaturas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  if (isChildRoute) {
    return <Outlet />;
  }

  const handleUpload = async (request: Requisicao, file: File | undefined) => {
    if (!file) return;

    setMessage(null);
    setError(null);

    if (shouldBlockSignatureUpload(request)) {
      setError(
        "Esta requisição está sem itens e não pode ser assinada. Refaça a requisição com os itens corretos.",
      );
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Envie apenas arquivo PDF.");
      return;
    }

    const isOutputStage = request.status === "aguardando_assinatura_saida";
    const safeName = sanitizeFileName(file.name) || "assinado.pdf";
    const storagePath = `${isOutputStage ? "saidas-assinadas" : "requisicoes-assinadas"}/${request.id}/${Date.now()}-${safeName}`;
    const attachment = {
      fileName: file.name,
      storageBucket: REQUISICOES_BUCKET,
      storagePath,
      uploadedAt: new Date().toISOString(),
      sourceUploadedAt: isOutputStage
        ? (request.admin_attachment as AttachmentFile | null)?.uploadedAt ||
          new Date().toISOString()
        : undefined,
      kind: isOutputStage ? ("output" as const) : ("request" as const),
    };

    setUploadingId(request.id);

    try {
      const { error: uploadError } = await supabase.storage
        .from(REQUISICOES_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (uploadError)
        throw new Error(
          uploadError.message ||
            "N?o foi poss?vel anexar o PDF. Verifique o arquivo e tente novamente.",
        );

      const signedAttachment = buildSignedAttachmentPayload(request.signed_attachment, {
        request: isOutputStage ? undefined : attachment,
        output: isOutputStage ? attachment : undefined,
      });
      const previousSignedAttachment = isOutputStage
        ? getOutputSignedAttachment(request.signed_attachment, request.status)
        : getRequestSignedAttachment(request.signed_attachment, request.status);
      const previousAdminAttachment = isOutputStage
        ? (request.admin_attachment as AttachmentFile | null)
        : null;

      const payload = {
        signed_attachment: signedAttachment,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        admin_attachment: (isOutputStage ? null : request.admin_attachment) as any,
        status: isOutputStage ? "concluido" : "recebido",
        return_reason: null,
        return_target: null,
        returned_at: null,
      };

      const { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", request.id);

      if (updateError) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update({
            signed_attachment: signedAttachment,
            status: isOutputStage ? "concluido" : "recebido",
          })
          .eq("id", request.id);

        if (fallbackUpdate.error) {
          throw new Error(fallbackUpdate.error.message);
        }
      }

      await Promise.all([
        removeOldAttachment(previousSignedAttachment),
        removeOldAttachment(previousAdminAttachment),
      ]);

      const sentMessage = isOutputStage
        ? "Saída assinada enviada pro Almoxarifado."
        : "Requisição assinada enviada pro Almoxarifado.";
      setMessage(sentMessage);
      try {
        await notifyRequestByWhatsApp({
          requestId: request.id,
          notificationType: "requestSigned",
        });
      } catch (notificationError) {
        console.error("Erro ao notificar WhatsApp:", notificationError);
      }

      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (err) {
      setError(getSignedPdfUploadErrorMessage(err));
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

  const handleDeletePendingRequest = async (request: Requisicao) => {
    const confirmed = window.confirm("Excluir esta requisição antes da assinatura?");
    if (!confirmed) return;

    setMessage(null);
    setError(null);

    try {
      let { error: deleteError } = await supabase
        .from("requisicoes")
        .update({
          status: "excluida_usuario",
          return_reason: null,
          return_target: null,
          returned_at: null,
        })
        .eq("id", request.id)
        .in("status", [
          "aguardando_assinatura",
          "aguardando_assinatura_requisicao",
          "aguardando_assinatura_saida",
          "correcao_requisicao",
        ]);

      if (deleteError && isMissingReturnFeedbackColumnError(deleteError.message)) {
        const fallbackDelete = await supabase
          .from("requisicoes")
          .update({ status: "excluida_usuario" })
          .eq("id", request.id)
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "aguardando_assinatura_saida",
            "correcao_requisicao",
          ]);

        deleteError = fallbackDelete.error;
      }

      if (deleteError) throw new Error(deleteError.message);

      setRequests((current) => current.filter((item) => item.id !== request.id));
      setMessage("Requisição excluída antes da assinatura.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir requisição.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuário / Assinaturas</p>
        <h2 className="text-2xl text-foreground">Minhas assinaturas</h2>
      </div>

      {message && <Card className="p-4 text-sm text-muted-foreground">{message}</Card>}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 border border-destructive/40 bg-destructive/10 text-destructive font-medium">
          {error}
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhum documento aguardando sua assinatura.
        </Card>
      ) : (
        <Card className="p-4">
          {error && (
            <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <div className="rounded-md overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Número / Nota</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Etapa</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Ação</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const hasRequestSigned = Boolean(
                    getRequestSignedAttachment(request.signed_attachment, request.status),
                  );
                  const missingItems = !hasRequestItems(request);
                  const requestCode = request.saida_codigo?.trim() || request.id.slice(0, 8);
                  const linkedOutputCode = request.saida_vinculada_codigo?.trim();
                  const isOutputStage = request.status === "aguardando_assinatura_saida";
                  const requestDisplayCode =
                    isOutputStage && linkedOutputCode ? linkedOutputCode : requestCode;
                  const displayDate = isOutputStage
                    ? formatOutputDate(request.saida_vinculada_data) || request.data || "-"
                    : request.data || "-";
                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        <div>{requestDisplayCode}</div>
                        {isOutputStage && linkedOutputCode && linkedOutputCode !== requestCode ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            Requisicao: {requestCode}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{displayDate}</td>
                      <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                      <td className="px-3 py-2 text-foreground">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {hasRequestSigned && request.status === "aguardando_assinatura_saida" && (
                            <CheckCircle2 className="h-4 w-4 text-orange-700" />
                          )}
                          {getStageLabel(request.status)}
                          {missingItems && (
                            <span className="text-xs text-destructive">
                              Requisição sem itens. Refaça antes de assinar.
                            </span>
                          )}
                          {request.return_reason && request.status === "correcao_requisicao" && (
                            <span className="text-xs text-amber-700">
                              Motivo da devolução: {request.return_reason}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            navigate({
                              to: "/admin/minhas-assinaturas/$requisicaoId/pdf",
                              params: { requisicaoId: request.id },
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                          Ver/Baixar
                        </Button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {request.status === "correcao_requisicao" ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                if (typeof window !== "undefined") {
                                  window.location.assign(
                                    `/admin/requisicao?requisicaoId=${request.id}`,
                                  );
                                }
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 text-destructive"
                              onClick={() => void handleDeletePendingRequest(request)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {canEditUnsignedRequest(request) && (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => {
                                    if (typeof window !== "undefined") {
                                      window.location.assign(
                                        `/admin/requisicao?requisicaoId=${request.id}`,
                                      );
                                    }
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2 text-destructive"
                                  onClick={() => void handleDeletePendingRequest(request)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Excluir
                                </Button>
                              </>
                            )}
                            {!canEditUnsignedRequest(request) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2 text-destructive"
                                onClick={() => void handleDeletePendingRequest(request)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Excluir
                              </Button>
                            )}
                            <div
                              className={`inline-flex flex-wrap items-center justify-end gap-2 rounded-md border px-2 py-2 transition-colors ${
                                draggingId === request.id
                                  ? "border-orange-500 bg-orange-50"
                                  : "border-transparent"
                              }`}
                              onDragEnter={() => setDraggingId(request.id)}
                              onDragOver={handleDragOver}
                              onDragLeave={(event) => handleDragLeave(event, request.id)}
                              onDrop={(event) => handleDrop(event, request)}
                            >
                              <input
                                id={`assinado-${request.id}`}
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(event) => {
                                  const picked = event.target.files?.[0];
                                  if (picked) {
                                    setStagedFiles((current) => ({
                                      ...current,
                                      [request.id]: picked,
                                    }));
                                  }
                                  event.currentTarget.value = "";
                                }}
                              />

                              {stagedFiles[request.id] ? (
                                <div className="flex items-center gap-2">
                                  <span className="max-w-44 truncate rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800">
                                    PDF: {stagedFiles[request.id].name}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={uploadingId === request.id}
                                    onClick={() => {
                                      const fileToUpload = stagedFiles[request.id];
                                      if (!fileToUpload) return;

                                      void handleUpload(request, fileToUpload).finally(() => {
                                        setStagedFiles((curr) => {
                                          const next = { ...curr };
                                          delete next[request.id];
                                          return next;
                                        });
                                      });
                                    }}
                                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                                    title="Enviar PDF assinado"
                                  >
                                    {uploadingId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="h-4 w-4 stroke-[3]" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className={`gap-2 rounded-xl ${
                                    draggingId === request.id
                                      ? "border-orange-500 bg-orange-100 text-orange-900 hover:bg-orange-100"
                                      : ""
                                  }`}
                                  disabled={uploadingId === request.id}
                                  onClick={() =>
                                    document.getElementById(`assinado-${request.id}`)?.click()
                                  }
                                >
                                  {uploadingId === request.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Upload className="h-4 w-4" />
                                  )}
                                  Anexar PDF
                                </Button>
                              )}

                              {draggingId === request.id && (
                                <span className="text-xs font-medium text-orange-700">
                                  Solte o PDF para reconhecer
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
