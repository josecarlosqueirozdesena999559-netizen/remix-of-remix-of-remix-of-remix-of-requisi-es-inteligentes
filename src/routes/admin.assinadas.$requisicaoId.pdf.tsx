import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const navigate = useNavigate();
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
        .select("id,saida_codigo,categoria,setor,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,signed_attachment,admin_attachment")
        .eq("id", requisicaoId)
        .maybeSingle();

      if (!active) return;

      if (requestResult.error) {
        setError(requestResult.error.message || "Erro ao carregar documento.");
        setLoading(false);
        return;
      }

      if (!requestResult.data) {
        setError("Requisição não encontrada.");
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Assinadas / PDF completo</p>
          <h2 className="text-2xl text-foreground">
            {pdf ? `Processo ${pdf.code}` : "Processo"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {pdf && (
            <Button asChild variant="outline" className="gap-2">
              <a href={pdf.url} download={pdf.fileName}>
                <Download className="h-4 w-4" />
                Baixar
              </a>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => navigate({ to: "/admin/assinadas" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="flex min-h-80 items-center justify-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Montando PDF completo...
        </Card>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : pdf ? (
        <iframe
          src={pdf.url}
          title={`Processo ${pdf.code}`}
          className="min-h-[720px] flex-1 rounded-md border bg-white"
        />
      ) : null}
    </div>
  );
}
