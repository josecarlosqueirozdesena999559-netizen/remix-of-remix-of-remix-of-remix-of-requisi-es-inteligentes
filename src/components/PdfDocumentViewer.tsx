import { Download, Loader2, Printer, X } from "lucide-react";
import { useEffect } from "react";
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onBack();
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onBack]);

  const handlePrint = () => {
    if (!url) return;
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    printWindow?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[1px] sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onBack();
      }}
    >
      <Card className="flex h-[94vh] w-full max-w-6xl flex-col gap-0 overflow-hidden rounded-xl border-slate-200 bg-white p-0 shadow-2xl sm:h-[90vh]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {url ? (
              <>
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <a href={url} download={fileName}>
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Baixar</span>
                  </a>
                </Button>
                <Button type="button" size="sm" className="gap-2" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">Imprimir</span>
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Fechar visualizador"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 bg-slate-200">
          {loading ? (
            <div className="flex h-full min-h-80 items-center justify-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              {loadingLabel}
            </div>
          ) : error ? (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error}
            </div>
          ) : url ? (
            <iframe
              src={`${url}#toolbar=1&navpanes=1&view=FitH`}
              title={title}
              className="h-full min-h-[520px] w-full border-0 bg-slate-200"
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
