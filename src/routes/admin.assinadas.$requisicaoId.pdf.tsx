import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";
import { supabase } from "@/integrations/supabase/client";
import type { RequestPdfItem } from "@/lib/request-pdf";
import {
  createSignedRequestProcessPdfBlob,
  getSignedRequestProcessCode,
} from "@/lib/signed-request-process-pdf";

export const Route = createFileRoute("/admin/assinadas/$requisicaoId/pdf")({
  component: PdfAssinadoCompletoPage,
});

interface RequisicaoAssinada {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
  solicitante: string | null;
  data: string | null;
  created_at: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
  categoria: string | null;
  solicitante_cpf: string | null;
  solicitante_funcao: string | null;
  items: RequestPdfItem[] | null;
}

interface PdfState {
  url: string;
  fileName: string;
  code: string;
}

function PdfAssinadoCompletoPage() {
  const { requisicaoId } = Route.useParams();
  const [pdf, setPdf] = useState<PdfState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function load() {
      setLoading(true);
      setError(null);

      const requestResult = await supabase
        .from("requisicoes")
        .select(
          "id,saida_codigo,categoria,setor,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,signed_attachment,admin_attachment",
        )
        .eq("id", requisicaoId)
        .maybeSingle();

      if (!active) return;

      if (requestResult.error) {
        setError(requestResult.error.message || "Erro ao carregar documento.");
        setLoading(false);
        return;
      }

      if (!requestResult.data) {
        setError("Solicitação não encontrada.");
        setLoading(false);
        return;
      }

      const request = requestResult.data as RequisicaoAssinada;
      const code = getSignedRequestProcessCode(request);
      const blob = await createSignedRequestProcessPdfBlob({
        ...request,
        items: request.items as RequestPdfItem[] | null,
      });
      createdUrl = URL.createObjectURL(blob);

      if (!active) {
        URL.revokeObjectURL(createdUrl);
        return;
      }

      setPdf({
        url: createdUrl,
        code,
        fileName: `Processo_${code}.pdf`,
      });
      setLoading(false);
    }

    load();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [requisicaoId]);

  return (
    <PdfDocumentViewer
      title="Visualizador de documento"
      subtitle={pdf ? `Processo ${pdf.code}` : "Processo assinado"}
      url={pdf?.url}
      fileName={pdf?.fileName}
      loading={loading}
      loadingLabel={"Montando PDF completo..."}
      error={error}
      onBack={() => window.history.back()}
    />
  );
}
