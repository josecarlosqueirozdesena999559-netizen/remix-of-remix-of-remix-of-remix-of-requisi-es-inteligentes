import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";
import {
  getAttachmentFiles,
  getRequestSignedAttachment,
  resolveAttachmentUrl,
  type AttachmentFile,
} from "@/lib/attachments";
import { formatRequestCodeDate, getRequestFileName } from "@/lib/request-code";
import { createCombinedSignedPdfBlob } from "@/lib/combined-pdf";
import { createRequestPdfBlob, type RequestPdfItem } from "@/lib/request-pdf";
import { resolveRequestForPdf, type RequisicaoPdfRow } from "@/lib/request-resolver";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/minhas-assinaturas/$requisicaoId/pdf")({
  component: MinhaAssinaturaPdfPage,
});

interface Requisicao extends RequisicaoPdfRow {
  admin_attachment: unknown;
  signed_attachment: unknown;
}

interface PdfState {
  title: string;
  fileName: string;
  url: string;
}

function MinhaAssinaturaPdfPage() {
  const { requisicaoId } = Route.useParams();
  const [pdf, setPdf] = useState<PdfState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function loadPdf() {
      setLoading(true);
      setError(null);

      try {
        const requestResult = await supabase
          .from("requisicoes")
          .select(
            "id,saida_codigo,categoria,setor,programa,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,admin_attachment,signed_attachment",
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
        const requestNumber = request.saida_codigo || request.id;

        if (request.status === "aguardando_assinatura_saida") {
          const outputUrl = await resolveAttachmentUrl(
            request.admin_attachment as AttachmentFile | null,
          );

          if (outputUrl) {
            setPdf({
              title: `Documento de saída - Solicitação No. ${requestNumber}`,
              fileName: `Saída-${requestNumber}.pdf`,
              url: outputUrl,
            });
            setLoading(false);
            return;
          }

          const requestSignedUrl = await resolveAttachmentUrl(
            getRequestSignedAttachment(request.signed_attachment, request.status),
          );

          if (requestSignedUrl) {
            setPdf({
              title: `Requisição No. ${requestNumber}`,
              fileName: getRequestFileName(requestNumber),
              url: requestSignedUrl,
            });
            setLoading(false);
            return;
          }
        }

        const code =
          request.saida_codigo || `${formatRequestCodeDate(request.data || request.created_at)}001`;

        if (!request.saida_codigo) {
          const { error: updateError } = await supabase
            .from("requisicoes")
            .update({ saida_codigo: code })
            .eq("id", request.id);

          if (updateError) {
            setError(updateError.message);
            setLoading(false);
            return;
          }
        }

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

        if (!active) {
          URL.revokeObjectURL(createdUrl);
          return;
        }

        setPdf({
          title: `Requisição ${code}`,
          fileName: getRequestFileName(code),
          url: createdUrl,
        });
        setLoading(false);
      } catch (err) {
        if (!active) return;

        setError(err instanceof Error ? err.message : "Erro ao carregar PDF.");
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [requisicaoId]);
  return (
    <PdfDocumentViewer
      title={pdf?.title || "Documento para assinatura"}
      subtitle="Assinaturas pendentes"
      url={pdf?.url}
      fileName={pdf?.fileName}
      loading={loading}
      loadingLabel="Carregando PDF..."
      error={error}
      onBack={() => window.history.back()}
    />
  );
}
