import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getAttachmentFiles,
  getOutputSignedAttachments,
  getRequestSignedAttachment,
  resolveAttachmentUrl,
  type AttachmentFile,
} from "@/lib/attachments";
import { createCombinedSignedPdfBlob } from "@/lib/combined-pdf";
import { createRequestPdfBlob, type RequestPdfItem } from "@/lib/request-pdf";
import { resolveRequestForPdf } from "@/lib/request-resolver";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/meus-assinados/$requisicaoId/pdf")({
  component: MeuAssinadoPdfPage,
});

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  categoria: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  solicitante_funcao: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
  items: RequestPdfItem[] | null;
}

function MeuAssinadoPdfPage() {
  const { requisicaoId } = Route.useParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("Solicitacao.pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function loadPdf() {
      setLoading(true);
      setError(null);

      const requestResult = await supabase
        .from("requisicoes")
        .select("id,saida_codigo,categoria,setor,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,signed_attachment,admin_attachment")
        .eq("id", requisicaoId)
        .maybeSingle();

      if (!active) return;

      if (requestResult.error) {
        setError(requestResult.error.message || "Erro ao carregar PDF.");
        setLoading(false);
        return;
      }

      if (!requestResult.data) {
        setError("Solicitação não encontrada.");
        setLoading(false);
        return;
      }

      const request = requestResult.data as Requisicao;
      const code = request.saida_codigo || request.id;
      const requestAttachment = getRequestSignedAttachment(
        request.signed_attachment,
        request.status,
      );
      const outputAttachments =
    getOutputSignedAttachments(request.signed_attachment, request.status).length > 0
      ? getOutputSignedAttachments(request.signed_attachment, request.status)
      : getAttachmentFiles(request.admin_attachment);

      const [requestUrl, outputUrls] = await Promise.all([
        resolveAttachmentUrl(requestAttachment),
        Promise.all(outputAttachments.map((attachment) => resolveAttachmentUrl(attachment))),
      ]);

      if (requestUrl && outputUrls.some(Boolean)) {
        const blob = await createCombinedSignedPdfBlob(outputUrls.filter(Boolean), requestUrl);
        createdUrl = URL.createObjectURL(blob);
      } else if (requestUrl || outputUrls.some(Boolean)) {
        createdUrl = requestUrl || outputUrls.find(Boolean) || "";
      } else {
        const blob = await createRequestPdfBlob(
          await resolveRequestForPdf(
            {
              ...request,
              items: request.items as RequestPdfItem[] | null,
            },
            code,
          ),
        );
        createdUrl = URL.createObjectURL(blob);
      }

      if (!active) {
        if (createdUrl.startsWith("blob:")) URL.revokeObjectURL(createdUrl);
        return;
      }

      setUrl(createdUrl);
      setFileName(`Requisicao-${code}.pdf`);
      setLoading(false);
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl.startsWith("blob:")) URL.revokeObjectURL(createdUrl);
    };
  }, [requisicaoId]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assinados / PDF</p>
          <h2 className="text-2xl text-foreground">PDF</h2>
        </div>
        <div className="flex items-center gap-2">
          {url && (
            <Button asChild variant="outline" className="gap-2">
              <a href={url} download={fileName}>
                <Download className="h-4 w-4" />
                Baixar
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => navigate({ to: "/admin/meus-assinados" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="flex min-h-80 items-center justify-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando PDF...
        </Card>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : url ? (
        <iframe
          src={url}
          title="PDF"
          className="min-h-[720px] flex-1 rounded-md border bg-white"
        />
      ) : null}
    </div>
  );
}
