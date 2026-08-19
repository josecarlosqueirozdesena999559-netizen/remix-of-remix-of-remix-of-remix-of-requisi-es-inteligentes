import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, CheckCircle2, Eye, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSignedAttachmentPayload,
  getAttachmentFiles,
  getOutputSignedAttachment,
  getOutputSignedAttachments,
  getRequestSignedAttachment,
  removeAttachmentFile,
  type AttachmentFile,
} from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import { formatOutputDate } from "@/lib/linked-output-date";
import { getRequestOwnerCpfVariants, getRequestOwnerLocation } from "@/lib/request-owner";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import type { RequestPdfItem } from "@/lib/request-pdf";
import { isDemoEmptySite } from "@/lib/demo-mode";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
import { getSelectedSharedRequesterProfile } from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";
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
  if (status === "aguardando_assinatura_saida") return "Assinar saída do SIG";
  if (status === "correcao_requisicao") return "Corrigir solicitação";
  return "Assinar solicitação";
}

function isRequestSignatureStatus(status: string) {
  return status === "aguardando_assinatura" || status === "aguardando_assinatura_requisicao";
}

function canEditUnsignedRequest(request: Requisicao) {
  return (
    (isRequestSignatureStatus(request.status) || request.status === "correcao_requisicao") &&
    !getRequestSignedAttachment(request.signed_attachment, request.status)
  );
}

function getRequiredOutputSignatureCount(request: Requisicao) {
  return Math.max(1, getAttachmentFiles(request.admin_attachment).length);
}

function needsCurrentStageSignature(request: Requisicao) {
  if (request.status === "aguardando_assinatura_saida") {
    return getOutputSignedAttachments(request.signed_attachment, request.status).length < getRequiredOutputSignatureCount(request);
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
  const [stagedFiles, setStagedFiles] = useState<Record<string, File[]>>({});
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
      if (isDemoEmptySite) {
        setRequests([]);
        return;
      }

      const { profile: authProfile } = await getCurrentUserProfile();
      const profile = isSharedSectorProfile(authProfile)
        ? await getSelectedSharedRequesterProfile(authProfile)
        : authProfile;

      if (!profile && isSharedSectorProfile(authProfile)) {
        navigate({ to: "/admin/selecionar-solicitante" });
        return;
      }

      const cpfVariants = getRequestOwnerCpfVariants(profile);
      const location = getRequestOwnerLocation(profile);
      const name = profile?.nome?.trim() || "";
      const isSharedSector = false;

      if (!isSharedSector && cpfVariants.length === 0 && !(name && location)) {
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
          "correcao_requisicao",
        ])
        .order("updated_at", { ascending: false });

      const scopedRequestsQuery = isSharedSector
        ? requestsQuery.eq("setor", location)
        : cpfVariants.length > 0
          ? requestsQuery.in("solicitante_cpf", cpfVariants)
          : requestsQuery.eq("solicitante", name).eq("setor", location);

      const scopedFallbackQuery = isSharedSector
        ? fallbackRequestsQuery.eq("setor", location)
        : cpfVariants.length > 0
          ? fallbackRequestsQuery.in("solicitante_cpf", cpfVariants)
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

  const handleUpload = async (request: Requisicao, files: File[] | File | undefined) => {
    const selectedFiles = Array.isArray(files) ? files : files ? [files] : [];
    if (selectedFiles.length === 0) return;

    setMessage(null);
    setError(null);

    if (shouldBlockSignatureUpload(request)) {
      setError(
        "Esta solicitação está sem itens e não pode ser assinada. Refaça a solicitação com os itens corretos.",
      );
      return;
    }

    const invalidFile = selectedFiles.find(
      (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
    );

    if (invalidFile) {
      setError("Envie apenas arquivos PDF.");
      return;
    }

    const isOutputStage = request.status === "aguardando_assinatura_saida";
    const requiredOutputCount = isOutputStage ? getRequiredOutputSignatureCount(request) : 1;

    if (isOutputStage && selectedFiles.length !== requiredOutputCount) {
      setError(
        requiredOutputCount === 1
          ? "Anexe 1 PDF de saída do SIG assinado."
          : `Anexe os ${requiredOutputCount} PDFs de saída do SIG assinados.`,
      );
      return;
    }

    const uploadedAttachments: AttachmentFile[] = [];

    setUploadingId(request.id);

    try {
      for (const file of selectedFiles) {
        const safeName = sanitizeFileName(file.name) || "assinado.pdf";
        const storagePath = `${isOutputStage ? "saidas-assinadas" : "requisicoes-assinadas"}/${request.id}/${Date.now()}-${uploadedAttachments.length + 1}-${safeName}`;
        const attachment: AttachmentFile = {
          fileName: file.name,
          storageBucket: REQUISICOES_BUCKET,
          storagePath,
          uploadedAt: new Date().toISOString(),
          sourceUploadedAt: isOutputStage
            ? getAttachmentFiles(request.admin_attachment).at(uploadedAttachments.length)?.uploadedAt ||
              new Date().toISOString()
            : undefined,
          kind: isOutputStage ? "output" : "request",
        };

        const { error: uploadError } = await supabase.storage
          .from(REQUISICOES_BUCKET)
          .upload(storagePath, file, {
            contentType: file.type || "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(
            uploadError.message ||
              "Não foi possível anexar o PDF. Verifique o arquivo e tente novamente.",
          );
        }

        uploadedAttachments.push(attachment);
      }

      const signedAttachment = buildSignedAttachmentPayload(request.signed_attachment, {
        request: isOutputStage ? undefined : uploadedAttachments[0],
        output: isOutputStage ? uploadedAttachments.at(-1) || null : undefined,
        outputs: isOutputStage ? uploadedAttachments : undefined,
      });
      const previousSignedAttachments = isOutputStage
        ? getOutputSignedAttachments(request.signed_attachment, request.status)
        : [getRequestSignedAttachment(request.signed_attachment, request.status)].filter(Boolean);
      const previousAdminAttachments = isOutputStage
        ? getAttachmentFiles(request.admin_attachment)
        : [];

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
        ...previousSignedAttachments.map((attachment) => removeOldAttachment(attachment)),
        ...previousAdminAttachments.map((attachment) => removeOldAttachment(attachment)),
      ]);

      const sentMessage = isOutputStage
        ? "Saída do SIG assinada enviada para o Almoxarifado."
        : "Solicitação assinada enviada para o Almoxarifado.";
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
      await Promise.all(uploadedAttachments.map((attachment) => removeOldAttachment(attachment)));
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
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      setStagedFiles((current) => ({ ...current, [request.id]: droppedFiles }));
    }
  };

  const handleDeletePendingRequest = async (request: Requisicao) => {
    const confirmed = window.confirm("Excluir esta solicitação antes da assinatura?");
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
      setMessage("Solicitação excluída antes da assinatura.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir solicitação.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuário / Assinaturas</p>
        <h2 className="text-2xl text-foreground">Minhas assinaturas</h2>
      </div>

      {message && (
        <Card className="border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {message}
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="border border-red-200 bg-red-50 p-6 font-medium text-red-700">
          {error}
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhum documento aguardando sua assinatura.
        </Card>
      ) : (
        <Card className="p-4">
          {error && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
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
                            Solicitação: {requestCode}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{displayDate}</td>
                      <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                      <td className="px-3 py-2 text-foreground">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {hasRequestSigned && request.status === "aguardando_assinatura_saida" && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          )}
                          {getStageLabel(request.status)}
                          {missingItems && (
                            <span className="text-xs text-destructive">
                              Solicitação sem itens. Refaça antes de assinar.
                            </span>
                          )}
                          {request.return_reason && request.status === "correcao_requisicao" && (
                            <span className="text-xs text-orange-700">
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
                        {(
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
                                  ? "border-emerald-500 bg-emerald-50"
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
                                multiple={request.status === "aguardando_assinatura_saida"}
                                onChange={(event) => {
                                  const picked = Array.from(event.target.files || []);
                                  if (picked.length > 0) {
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
                                  <span className="max-w-44 truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                    {stagedFiles[request.id].length === 1
                                      ? `PDF: ${stagedFiles[request.id][0].name}`
                                      : `${stagedFiles[request.id].length} PDFs selecionados`}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={uploadingId === request.id}
                                    onClick={() => {
                                      const filesToUpload = stagedFiles[request.id];
                                      if (!filesToUpload?.length) return;

                                      void handleUpload(request, filesToUpload).finally(() => {
                                        setStagedFiles((curr) => {
                                          const next = { ...curr };
                                          delete next[request.id];
                                          return next;
                                        });
                                      });
                                    }}
                                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 hover:bg-emerald-50"
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
                                  {request.status === "aguardando_assinatura_saida"
                                    ? `Anexar ${getRequiredOutputSignatureCount(request)} PDFs`
                                    : "Anexar PDF"}
                                </Button>
                              )}

                              {draggingId === request.id && (
                                <span className="text-xs font-medium text-emerald-700">
                                  {request.status === "aguardando_assinatura_saida"
                                    ? "Solte os PDFs assinados"
                                    : "Solte o PDF para reconhecer"}
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
