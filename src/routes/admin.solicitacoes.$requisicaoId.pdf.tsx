import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";
import { supabase } from "@/integrations/supabase/client";
import { getRequestSignedAttachment, resolveAttachmentUrl } from "@/lib/attachments";
import { formatProgramName } from "@/lib/program-options";
import { formatRequestCodeDate, getRequestFileName } from "@/lib/request-code";
import { createRequestPdfBlob, type RequestPdfData, type RequestPdfItem } from "@/lib/request-pdf";

export const Route = createFileRoute("/admin/solicitacoes/$requisicaoId/pdf")({
  component: SolicitacaoPdfPage,
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
  items: RequestPdfItem[] | null;
  signed_attachment: unknown;
}

interface PdfState {
  code: string;
  fileName: string;
  url: string;
}

function SolicitacaoPdfPage() {
  const { requisicaoId } = Route.useParams();
  const navigate = useNavigate();
  const [pdf, setPdf] = useState<PdfState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function resolveRequestForPdf(
      request: Requisicao,
      code: string,
    ): Promise<RequestPdfData> {
      let programa = request.programa || request.setor || "-";
      let requesterDisplayName = request.solicitante || "-";
      let requesterDisplayCpf = request.solicitante_cpf || "-";
      let requesterDisplayRole = request.solicitante_funcao || "Solicitante do setor";

      const sectorName = request.setor?.trim();
      if (sectorName && !request.programa) {
        const { data: setorData } = await supabase
          .from("setores")
          .select("programa")
          .eq("nome", sectorName)
          .maybeSingle();

        if (setorData?.programa) {
          programa = setorData.programa;
        }
      }

      if (request.solicitante_cpf) {
        const { data: profile } = await supabase
          .from("usuarios")
          .select("nome,cpf,funcao,setor")
          .eq("cpf", request.solicitante_cpf)
          .maybeSingle();

        if (profile?.nome) requesterDisplayName = profile.nome;
        if (profile?.cpf) requesterDisplayCpf = profile.cpf;
        if (profile?.funcao) requesterDisplayRole = profile.funcao;
        if (!sectorName && profile?.setor) programa = profile.setor;
      }

      return {
        ...request,
        saida_codigo: code,
        programa: formatProgramName(programa) || programa,
        requesterDisplayName,
        requesterDisplayCpf,
        requesterDisplayRole,
      };
    }

    async function loadPdf() {
      setLoading(true);
      setError(null);

      const requestResult = await supabase
        .from("requisicoes")
        .select(
          "id,saida_codigo,categoria,setor,programa,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,signed_attachment",
        )
        .eq("id", requisicaoId)
        .maybeSingle();

      if (!active) return;

      if (requestResult.error) {
        setError(requestResult.error.message || "Erro ao carregar solicitação.");
        setLoading(false);
        return;
      }

      if (!requestResult.data) {
        setError("Solicitação não encontrada.");
        setLoading(false);
        return;
      }

      const request = requestResult.data as Requisicao;
      const code =
        request.saida_codigo || `${formatRequestCodeDate(request.data || request.created_at)}001`;
      const signedRequestAttachment = getRequestSignedAttachment(
        request.signed_attachment,
        request.status,
      );

      if (!request.saida_codigo) {
        const { error } = await supabase
          .from("requisicoes")
          .update({ saida_codigo: code })
          .eq("id", request.id);

        if (error) {
          setError(error.message);
          setLoading(false);
          return;
        }
      }

      const signedRequestUrl = await resolveAttachmentUrl(signedRequestAttachment);

      if (signedRequestUrl) {
        createdUrl = signedRequestUrl;
      } else {
        const blob = await createRequestPdfBlob(await resolveRequestForPdf(request, code));
        createdUrl = URL.createObjectURL(blob);
      }

      if (!active) {
        if (createdUrl.startsWith("blob:")) URL.revokeObjectURL(createdUrl);
        return;
      }

      setPdf({
        code,
        fileName: getRequestFileName(code),
        url: createdUrl,
      });
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
      subtitle={pdf ? `Solicitação ${pdf.code}` : "Solicitação"}
      url={pdf?.url}
      fileName={pdf?.fileName}
      loading={loading}
      loadingLabel="Gerando PDF..."
      error={error}
      onBack={() => navigate({ to: "/admin/solicitacoes" })}
    />
  );
}
