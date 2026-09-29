import { ArrowLeft, Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PdfDocumentViewerProps {
  title: string;
  subtitle?: string;
  url?: string | null;
  fileName?: string;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onBack: () => void;
}

export function PdfDocumentViewer({
  title,
  subtitle,
  url,
  fileName = "documento.pdf",
  loading = false,
  loadingLabel = "Carregando documento...",
  error,
  onBack,
}: PdfDocumentViewerProps) {
  const handlePrint = () => {
    if (!url) return;
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    printWindow?.focus();
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-3">
      <Card className="flex flex-col gap-3 rounded-lg border-slate-200 bg-white px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        </div>
        {url ? (
          <div className="flex items-center gap-2 pl-12 sm:pl-0">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={url} download={fileName}>
                <Download className="h-4 w-4" />
                Baixar
              </a>
            </Button>
            <Button type="button" size="sm" className="gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
          </div>
        ) : null}
      </Card>
      {loading ? (
        <Card className="flex min-h-80 flex-1 items-center justify-center gap-2 border-slate-200 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>
      ) : url ? (
        <Card className="flex-1 overflow-hidden rounded-lg border-slate-200 bg-slate-200 p-0 shadow-sm">
          <iframe
            src={`${url}#toolbar=1&navpanes=1&view=FitH`}
            title={title}
            className="h-[calc(100vh-13rem)] min-h-[620px] w-full border-0 bg-slate-200"
          />
        </Card>
      ) : null}
    </div>
  );
}
