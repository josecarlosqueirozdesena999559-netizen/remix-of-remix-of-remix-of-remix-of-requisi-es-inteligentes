import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolveAttachmentUrl, type AttachmentFile } from "@/lib/attachments";
import {
  buildGlobalRequestCodes,
  formatRequestCodeDate,
  getRequestFileName,
} from "@/lib/request-code";
import { createRequestPdfBlob, type RequestPdfItem } from "@/lib/request-pdf";
import { resolveRequestForPdf, type RequisicaoPdfRow } from "@/lib/request-resolver";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/minhas-assinaturas/$requisicaoId/pdf")({
  component: MinhaAssinaturaPdfPage,
});

interface Requisicao extends RequisicaoPdfRow {
  admin_attachment: unknown;
}

interface PdfState {
  title: string;
  fileName: string;
  url: string;
}

function MinhaAssinaturaPdfPage() {
  const { requisicaoId } = Route.useParams();
  const navigate = useNavigate();
  const [pdf, setPdf] = useState<PdfState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl = "";

    async function loadPdf() {
      setLoading(true);
      setError(null);

      const [requestResult, allResult] = await Promise.all([
        supabase
          .from("requisicoes")
          .select(
            "id,saida_codigo,categoria,setor,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,items,admin_attachment",
          )
          .eq("id", requisicaoId)
          .maybeSingle(),
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (requestResult.error || allResult.error) {
        setError(
          requestResult.error?.message || allResult.error?.message || "Erro ao carregar PDF.",
        );
        setLoading(false);
        return;
      }

      if (!requestResult.data) {
        setError("Requisição não encontrada.");
        setLoading(false);
        return;
      }

      const request = requestResult.data as Requisicao;

      if (request.status === "aguardando_assinatura_saida") {
        const url = await resolveAttachmentUrl(request.admin_attachment as AttachmentFile | null);

        if (!url) {
          setError("Documento de saída ainda não foi anexado pelo admin.");
          setLoading(false);
          return;
        }

        setPdf({
          title: "Documento de saída",
          fileName: `Saída-${request.saida_codigo || request.id}.pdf`,
          url,
        });
        setLoading(false);
        return;
      }

      const codeByRequestId = buildGlobalRequestCodes((allResult.data ?? []) as Requisicao[]);
      const code =
        request.saida_codigo ||
        codeByRequestId.get(request.id) ||
        `${formatRequestCodeDate(request.data || request.created_at)}001`;

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
    }

    loadPdf();

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [requisicaoId]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Minhas assinaturas / PDF</p>
          <h2 className="text-2xl text-foreground">{pdf?.title || "PDF"}</h2>
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
            onClick={() => navigate({ to: "/admin/minhas-assinaturas" })}
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
      ) : pdf ? (
        <iframe
          src={pdf.url}
          title={pdf.title}
          className="min-h-[720px] flex-1 rounded-md border bg-white"
        />
      ) : null}
    </div>
  );
}
