import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  resolveAttachmentUrl,
  type AttachmentFile,
} from "@/lib/attachments";
import { createCombinedSignedPdfBlob } from "@/lib/combined-pdf";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/meus-assinados/$requisicaoId/pdf")({
  component: MeuAssinadoPdfPage,
});

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
}

function MeuAssinadoPdfPage() {
  const { requisicaoId } = Route.useParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("Requisição-completa.pdf");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function loadPdf() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("requisicoes")
        .select("id,saida_codigo,status,signed_attachment,admin_attachment")
        .eq("id", requisicaoId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Requisição não encontrada.");
        setLoading(false);
        return;
      }

      const request = data as Requisicao;
      const requestAttachment = getRequestSignedAttachment(
        request.signed_attachment,
        request.status,
      );
      const outputAttachment =
        getOutputSignedAttachment(request.signed_attachment, request.status) ||
        (request.admin_attachment as AttachmentFile | null);

      const requestUrl = await resolveAttachmentUrl(requestAttachment);
      const outputUrl = await resolveAttachmentUrl(outputAttachment);

      if (!requestUrl && !outputUrl) {
        setError("PDF assinado não encontrado.");
        setLoading(false);
        return;
      }

      if (requestUrl && outputUrl) {
        const blob = await createCombinedSignedPdfBlob(outputUrl, requestUrl);
        createdUrl = URL.createObjectURL(blob);
      } else {
        createdUrl = requestUrl || outputUrl;
      }

      if (!active) {
        if (createdUrl.startsWith("blob:")) URL.revokeObjectURL(createdUrl);
        return;
      }

      setUrl(createdUrl);
      setFileName(`Requisição-completa-${request.saida_codigo || request.id}.pdf`);
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
          <h2 className="text-2xl text-foreground">PDF completo</h2>
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
          title="PDF completo"
          className="min-h-[720px] flex-1 rounded-md border bg-white"
        />
      ) : null}
    </div>
  );
}
