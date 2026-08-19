import { createFileRoute } from "@tanstack/react-router";
import { Archive, Download, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { isDemoEmptySite } from "@/lib/demo-mode";
import { createZipBlob, downloadBlob } from "@/lib/browser-zip";
import { getAttachmentFile, getOutputSignedAttachment } from "@/lib/attachments";
import { resolveCanonicalLocationName, type LocationOption } from "@/lib/location-normalizer";
import { getRequestArchiveMonth } from "@/lib/request-archive-month";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import {
  createSignedRequestProcessPdfBlob,
  type SignedRequestProcessPdfRow,
} from "@/lib/signed-request-process-pdf";

export const Route = createFileRoute("/admin/backup")({
  component: BackupPage,
});

interface BackupRequest extends SignedRequestProcessPdfRow {
  printed_at: string | null;
}

interface BackupMonth {
  value: string;
  label: string;
  count: number;
}

function hasOutputDocument(request: BackupRequest) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(monthNumber);

  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) return month;

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(parsedYear, parsedMonth - 1, 1));
}

function sanitizePathPart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "sem-nome"
  );
}

function buildBackupFilePath(month: string, request: BackupRequest, code: string) {
  const location = sanitizePathPart(request.setor || "Sem local");
  const folderCode = sanitizePathPart(code);

  return `${month}/${location}/${folderCode}/Processo_${folderCode}.pdf`;
}

async function fetchCompletedRequests() {
  if (isDemoEmptySite) return [];

  const pageSize = 1000;
  let from = 0;
  const requests: BackupRequest[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("requisicoes")
      .select(
        "id,saida_codigo,categoria,setor,solicitante,solicitante_cpf,solicitante_funcao,data,created_at,status,signed_attachment,admin_attachment,printed_at",
      )
      .eq("status", "concluido")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as BackupRequest[];
    requests.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return requests;
}

function BackupPage() {
  const [requests, setRequests] = useState<BackupRequest[]>([]);
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [completedRequests, setoresResult] = await Promise.all([
          fetchCompletedRequests(),
          supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        ]);

        if (!active) return;

        if (setoresResult.error) throw new Error(setoresResult.error.message);

        const locationOptions = (setoresResult.data ?? []) as LocationOption[];
        const visibleRequests = completedRequests
          .filter(hasOutputDocument)
          .map((request) => ({
            ...request,
            setor: resolveCanonicalLocationName(request.setor, locationOptions) || request.setor,
          }));

        setRequests(visibleRequests);
        setCodeByRequestId(buildGlobalRequestCodes(completedRequests));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar backup.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const months = useMemo<BackupMonth[]>(() => {
    const countByMonth = new Map<string, number>();

    requests.forEach((request) => {
      const month = getRequestArchiveMonth(request);
      if (!month) return;

      countByMonth.set(month, (countByMonth.get(month) ?? 0) + 1);
    });

    return Array.from(countByMonth.entries())
      .map(([value, count]) => ({ value, label: formatMonthLabel(value), count }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [requests]);

  useEffect(() => {
    if (!selectedMonth && months[0]) {
      setSelectedMonth(months[0].value);
    }
  }, [months, selectedMonth]);

  const selectedRequests = useMemo(
    () => requests.filter((request) => getRequestArchiveMonth(request) === selectedMonth),
    [requests, selectedMonth],
  );

  const downloadBackup = async () => {
    if (!selectedMonth || selectedRequests.length === 0) return;

    setDownloading(true);
    setMessage(null);
    setError(null);
    setProgress("Preparando PDFs...");

    try {
      const files = [];

      for (let index = 0; index < selectedRequests.length; index += 1) {
        const request = selectedRequests[index];
        const code = request.saida_codigo || codeByRequestId.get(request.id) || request.id;

        setProgress(`Gerando ${index + 1} de ${selectedRequests.length}: ${code}`);
        files.push({
          path: buildBackupFilePath(selectedMonth, request, code),
          blob: await createSignedRequestProcessPdfBlob({
            ...request,
            saida_codigo: code,
            items: request.items ?? null,
          }),
        });
      }

      setProgress("Montando arquivo ZIP...");
      const zipBlob = await createZipBlob(files);
      downloadBlob(zipBlob, `backup-pdfs-${selectedMonth}.zip`);
      setMessage(`Backup de ${formatMonthLabel(selectedMonth)} gerado com ${files.length} PDFs.`);
      setProgress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar backup.");
      setProgress("");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Inicio / Backup</p>
        <h2 className="text-2xl text-foreground">Backup de PDFs</h2>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="flex max-w-xs flex-col gap-2 text-sm text-muted-foreground">
            Mes disponivel
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
              disabled={loading || months.length === 0 || downloading}
            >
              {months.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label} ({month.count})
                </option>
              ))}
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={loading || downloading || selectedRequests.length === 0}
            onClick={() => void downloadBackup()}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Baixar ZIP
          </Button>
        </div>
      </Card>

      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando meses disponiveis...
        </Card>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : months.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhum PDF assinado encontrado para backup.
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Archive className="mt-1 h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-foreground">
                {selectedRequests.length} PDFs em {formatMonthLabel(selectedMonth)}
              </p>
              <p className="text-sm text-muted-foreground">
                O ZIP organiza os arquivos por mes, local e numero da requisicao.
              </p>
              {progress ? <p className="text-sm text-muted-foreground">{progress}</p> : null}
              {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
