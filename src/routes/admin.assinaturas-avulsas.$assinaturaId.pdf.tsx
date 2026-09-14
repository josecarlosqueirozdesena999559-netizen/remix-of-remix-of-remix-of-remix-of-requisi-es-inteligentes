import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { resolveAttachmentUrl } from "@/lib/attachments";
import {
  getAvulsaAttachmentFiles,
  getAvulsaDisplayCode,
  type AvulsaSignatureRow,
} from "@/lib/avulsa-signatures";
import { createCombinedSignedPdfBlob } from "@/lib/combined-pdf";

export const Route = createFileRoute("/admin/assinaturas-avulsas/$assinaturaId/pdf")({
  component: AssinaturaAvulsaPdfPage,
});

function AssinaturaAvulsaPdfPage() {
  const { assinaturaId } = Route.useParams();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("documento-avulso.pdf");
  const [title, setTitle] = useState("Assinatura avulsa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl = "";

    async function load() {
      setLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("assinaturas_avulsas" as any)
        .select("id,avulsa_codigo,saida_codigo,titulo,status,admin_attachment,signed_attachment")
        .eq("id", assinaturaId)
        .maybeSingle();

      if (!active) return;

      if (loadError) {
        setError(loadError.message || "Erro ao carregar documento.");
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Documento avulso nao encontrado.");
        setLoading(false);
        return;
      }

      const row = data as AvulsaSignatureRow;
      const signedAttachments = getAvulsaAttachmentFiles(row.signed_attachment);
      const adminAttachments = getAvulsaAttachmentFiles(row.admin_attachment);
      const attachments = signedAttachments.length > 0 ? signedAttachments : adminAttachments;

      if (attachments.length === 0) {
        setError("Documento sem anexo disponivel.");
        setLoading(false);
        return;
      }

      try {
        const signedUrls = (
          await Promise.all(attachments.map((attachment) => resolveAttachmentUrl(attachment)))
        ).filter(Boolean);

        if (!active) return;

        if (signedUrls.length === 0) {
          setError("Documento sem anexo disponivel.");
          setLoading(false);
          return;
        }

        const nextUrl =
          signedUrls.length === 1
            ? signedUrls[0]
            : URL.createObjectURL(await createCombinedSignedPdfBlob(signedUrls, ""));

        if (signedUrls.length > 1) objectUrl = nextUrl;

        setUrl(nextUrl);
        setFileName(
          signedUrls.length === 1
            ? attachments[0].fileName || `${row.titulo || "documento-avulso"}.pdf`
            : `${row.titulo || "documento-avulso"}.pdf`,
        );
        setTitle(
          `${getAvulsaDisplayCode(row)}${row.saida_codigo ? ` / SIG ${row.saida_codigo}` : ""} - ${
            row.titulo || "Assinatura avulsa"
          }`,
        );
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao abrir documento.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assinaturaId]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Assinaturas avulsas / PDF</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {url ? (
            <Button asChild variant="outline" className="gap-2">
              <a href={url} download={fileName}>
                <Download className="h-4 w-4" />
                Baixar
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => navigate({ to: "/admin/assinaturas-avulsas" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="flex min-h-80 items-center justify-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando documento...
        </Card>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : url ? (
        <iframe
          src={url}
          title={title}
          className="min-h-[720px] flex-1 rounded-md border bg-white"
        />
      ) : null}
    </div>
  );
}
