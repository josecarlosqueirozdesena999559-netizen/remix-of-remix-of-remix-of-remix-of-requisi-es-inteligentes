import { ALMOXARIFADO_WHATSAPP_NUMBER } from "@/lib/almoxarifado-contact";
import { createAdministrativePdfBlob, toPdfText } from "@/lib/pdf-document";

export interface SignedRequestMonthlyPdfRow {
  code: string;
  outputCode: string;
  requester: string;
  location: string;
  requestDate: string;
  outputDate: string;
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

function sortRows(rows: SignedRequestMonthlyPdfRow[]) {
  return [...rows].sort((a, b) => {
    const locationCompare = a.location.localeCompare(b.location, "pt-BR");
    if (locationCompare !== 0) return locationCompare;

    const requesterCompare = a.requester.localeCompare(b.requester, "pt-BR");
    if (requesterCompare !== 0) return requesterCompare;

    return a.code.localeCompare(b.code, "pt-BR");
  });
}

export async function createSignedRequestsMonthlyPdfBlob(
  month: string,
  rows: SignedRequestMonthlyPdfRow[],
) {
  const sortedRows = sortRows(rows);
  const monthLabel = formatMonthLabel(month);
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  return createAdministrativePdfBlob({
    title: "Relatório mensal de requisições assinadas",
    subject: `Relatório mensal de requisições assinadas — ${monthLabel}`,
    documentInfo: [
      { label: "Modalidade", value: "Relatório" },
      { label: "Mês de referência", value: monthLabel },
      { label: "Total de registros", value: String(sortedRows.length) },
      { label: "Gerado em", value: generatedAt },
    ],
    table: {
      sectionTitle: "Requisições do período",
      columns: [
        { title: "NÚMERO", width: 22, align: "center" },
        { title: "REQUISITANTE", width: 42, align: "left" },
        { title: "SETOR SOLICITANTE", width: 54, align: "left" },
        { title: "DATA DA SOLICITAÇÃO", width: 31, align: "center" },
        { title: "DATA DA SAÍDA", width: 31, align: "center" },
      ],
      rows: sortedRows.map((row) => [
        toPdfText(row.code || "—"),
        toPdfText(row.requester || "—"),
        toPdfText(row.location || "—"),
        toPdfText(row.requestDate || "—"),
        toPdfText(row.outputDate || "—"),
      ]),
      emptyRow: ["—", "Nenhuma requisição encontrada", "—", "—", "—"],
      fontSize: 7.5,
    },
    contactNumber: ALMOXARIFADO_WHATSAPP_NUMBER,
  });
}

export async function downloadSignedRequestsMonthlyPdf(
  month: string,
  rows: SignedRequestMonthlyPdfRow[],
) {
  const blob = await createSignedRequestsMonthlyPdfBlob(month, rows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `requisicoes-assinadas-${month}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
