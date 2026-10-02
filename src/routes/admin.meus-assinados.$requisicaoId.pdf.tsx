import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";
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
  programa?: string | null;
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
        .select(
          "id,saida_codigo,categoria,setor,programa,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,signed_attachment,admin_attachment",
        )
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
    <PdfDocumentViewer
      title="Visualizador de documento"
      subtitle={"Documento assinado"}
      url={url}
      fileName={fileName}
      loading={loading}
      loadingLabel={"Carregando PDF..."}
      error={error}
      onBack={() => window.history.back()}
    />
  );
}
