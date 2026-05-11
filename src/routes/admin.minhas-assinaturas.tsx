import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Eye, Loader2, Upload, Wrench } from "lucide-react";
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
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
import { getCurrentUserProfile } from "@/lib/user-profile";
import { notifyRequestByWhatsApp } from "@/lib/whatsapp-edge";

export const Route = createFileRoute("/admin/minhas-assinaturas")({
  component: MinhasAssinaturasPage,
});

interface Requisicao {
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
  return_reason: string | null;
  return_target: string | null;
}

const baseSelect =
  "id,saida_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,signed_attachment,admin_attachment";

function getStageLabel(status: string) {
  if (status === "aguardando_assinatura_saida") return "Assinar saída";
  if (status === "correcao_requisicao") return "Corrigir requisição";
  return "Assinar requisição";
}

function isRequestSignatureStatus(status: string) {
  return status === "aguardando_assinatura" || status === "aguardando_assinatura_requisicao";
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
  const code = request.saida_codigo?.trim();
  if (code) {
    return `code:${code}|status:${request.status}`;
  }

  return [
    request.status,
    request.solicitante_cpf?.trim() || "",
    request.setor?.trim() || "",
    request.data?.trim() || "",
    request.return_target?.trim() || "",
    request.return_reason?.trim() || "",
  ].join("|");
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

async function removeOldAttachment(attachment: AttachmentFile | null | undefined) {
  try {
    await removeAttachmentFile(attachment);
  } catch (error) {
    console.warn("Nao foi possivel remover anexo antigo.", error);
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
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);

    try {
      const { profile } = await getCurrentUserProfile();

      if (!profile?.cpf) {
        setRequests([]);
        return;
      }

      const [{ data: setoresData, error: setoresError }, requestsResult] = await Promise.all([
        supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        supabase
          .from("requisicoes")
          .select(`${baseSelect},return_reason,return_target`)
          .eq("solicitante_cpf", profile.cpf)
          .in("status", ["aguardando_assinatura", "aguardando_assinatura_requisicao", "aguardando_assinatura_saida", "correcao_requisicao"])
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);

      let { data, error } = requestsResult;

      if (setoresError) {
        throw new Error(setoresError.message);
      }

      const locationOptions = (setoresData ?? []) as LocationOption[];

      if (error && isMissingReturnFeedbackColumnError(error.message)) {
        const fallbackResult = await supabase
          .from("requisicoes")
          .select(baseSelect)
          .eq("solicitante_cpf", profile.cpf)
          .in("status", ["aguardando_assinatura", "aguardando_assinatura_requisicao", "aguardando_assinatura_saida"])
          .order("updated_at", { ascending: false })
          .limit(20);

        data = (fallbackResult.data ?? []).map((request) => ({
          ...request,
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
      kind: isOutputStage ? "output" as const : "request" as const,
    };

    setUploadingId(request.id);

    try {
      const { error: uploadError } = await supabase.storage
        .from(REQUISICOES_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

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
        admin_attachment: isOutputStage ? null : request.admin_attachment,
        status: isOutputStage ? "concluido" : "recebido",
        return_reason: null,
        return_target: null,
        returned_at: null,
      };

      let { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", request.id);

      if (updateError && isMissingReturnFeedbackColumnError(updateError.message)) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update(omitReturnFeedbackFields(payload))
          .eq("id", request.id);

        updateError = fallbackUpdate.error;
      }

      if (updateError) throw new Error(updateError.message);

      await Promise.all([
        removeOldAttachment(previousSignedAttachment),
        removeOldAttachment(previousAdminAttachment),
      ]);

      setMessage(isOutputStage ? "Saída assinada enviada." : "Requisição assinada enviada.");
      try {
        await notifyRequestByWhatsApp({
          requestId: request.id,
          notificationType: "requestSigned",
        });
      } catch (notificationError) {
        console.error(notificationError);
      }

      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar PDF assinado.");
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
    void handleUpload(request, event.dataTransfer.files?.[0]);
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
        <Card className="p-6 text-destructive">{error}</Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhum documento aguardando sua assinatura.</Card>
      ) : (
        <Card className="p-4">
          <div className="rounded-md overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Etapa</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Ação</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
                  const hasRequestSigned = Boolean(getRequestSignedAttachment(request.signed_attachment, request.status));
                  return (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{request.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{request.setor || "-"}</td>
                      <td className="px-3 py-2 text-foreground">
                        <span className="inline-flex items-center gap-1">
                          {hasRequestSigned && request.status === "aguardando_assinatura_saida" && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          )}
                          {request.status === "correcao_requisicao" && (
                            <Wrench className="h-4 w-4 text-amber-700" />
                          )}
                          {getStageLabel(request.status)}
                        </span>
                        {request.return_reason && request.status === "correcao_requisicao" && (
                          <p className="mt-1 text-xs text-amber-700">{request.return_reason}</p>
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.location.assign(`/admin/requisicao?requisicaoId=${request.id}`);
                              }
                            }}
                          >
                            <Wrench className="h-4 w-4" />
                            Corrigir
                          </Button>
                        ) : (
                          <div
                            className={`inline-flex flex-wrap items-center justify-end gap-2 rounded-md border px-2 py-2 transition-colors ${
                              draggingId === request.id ? "border-emerald-500 bg-emerald-50" : "border-transparent"
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
                              disabled={uploadingId === request.id}
                              onChange={(event) => {
                                void handleUpload(request, event.target.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`gap-2 ${draggingId === request.id ? "border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-100" : ""}`}
                              disabled={uploadingId === request.id}
                              onClick={() => document.getElementById(`assinado-${request.id}`)?.click()}
                            >
                              {uploadingId === request.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              Anexar
                            </Button>
                            {draggingId === request.id && (
                              <span className="text-xs font-medium text-emerald-700">
                                Solte o PDF para enviar agora
                              </span>
                            )}
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
