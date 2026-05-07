import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Eye, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getRequestSignedAttachment } from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import { getCurrentUserProfile } from "@/lib/user-profile";

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
}

function getStageLabel(status: string) {
  if (status === "aguardando_assinatura_saida") return "Assinar saída";
  return "Assinar requisição";
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

  async function loadRequests() {
    setLoading(true);
    setError(null);

    try {
      const { profile } = await getCurrentUserProfile();

      if (!profile?.cpf) {
        setRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from("requisicoes")
        .select("id,saida_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,signed_attachment,admin_attachment")
        .eq("solicitante_cpf", profile.cpf)
        .in("status", ["aguardando_assinatura", "aguardando_assinatura_saida"])
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      setRequests((data ?? []) as Requisicao[]);
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
      kind: isOutputStage ? "output" : "request",
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

      const current = request.signed_attachment && typeof request.signed_attachment === "object"
        ? (request.signed_attachment as Record<string, unknown>)
        : {};

      const signedAttachment = isOutputStage
        ? { ...current, output: attachment }
        : { ...current, request: attachment };

      const { error: updateError } = await supabase
        .from("requisicoes")
        .update({
          signed_attachment: signedAttachment,
          status: isOutputStage ? "concluido" : "recebido",
        })
        .eq("id", request.id);

      if (updateError) throw new Error(updateError.message);

      setMessage(isOutputStage ? "Saída assinada enviada." : "Requisição assinada enviada.");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar PDF assinado.");
    } finally {
      setUploadingId(null);
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
        <Card className="p-6 text-destructive">{error}</Card>
      ) : requests.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhum documento aguardando sua assinatura.</Card>
      ) : (
        <Card className="p-4">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Local</th>
                  <th className="px-3 py-2 text-left font-normal">Etapa</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Assinado gov.br</th>
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
                          {getStageLabel(request.status)}
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
                          className="gap-2"
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
