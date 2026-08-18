import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_MARGIN = 14;

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export interface SignedRequestMonthlyPdfRow {
  code: string;
  requester: string;
  location: string;
  requestDate: string;
}

function toPdfText(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "");
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
  const doc = new jsPDF() as JsPdfWithAutoTable;
  const sortedRows = sortRows(rows);
  const monthLabel = formatMonthLabel(month);
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());

  doc.setProperties({
    title: `Requisicoes assinadas ${monthLabel}`,
    subject: "Relatório mensal de solicitações assinadas",
    creator: "Sistema Almoxarifado",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(toPdfText("Solicitações assinadas do mês"), PAGE_MARGIN, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(toPdfText(`Mês: ${monthLabel}`), PAGE_MARGIN, 26);
  doc.text(toPdfText(`Total: ${sortedRows.length}`), PAGE_MARGIN, 32);
  doc.text(toPdfText(`Gerado em: ${generatedAt}`), PAGE_MARGIN, 38);

  autoTable(doc, {
    startY: 46,
    head: [[
      toPdfText("Número"),
      toPdfText("Requisitante"),
      toPdfText("Local"),
      toPdfText("Data"),
    ]],
    body: sortedRows.length
      ? sortedRows.map((row) => [
          toPdfText(row.code || "-"),
          toPdfText(row.requester || "-"),
          toPdfText(row.location || "-"),
          toPdfText(row.requestDate || "-"),
        ])
      : [[toPdfText("-"), toPdfText("Nenhuma solicitação encontrada"), "-", "-"]],
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 16 },
    headStyles: {
      fillColor: [244, 244, 244],
      textColor: [20, 20, 20],
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      halign: "center",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8.8,
      textColor: [20, 20, 20],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 26, halign: "center" },
      1: { cellWidth: 58 },
      2: { cellWidth: 72 },
      3: { cellWidth: 28, halign: "center" },
    },
    styles: {
      overflow: "linebreak",
      font: "helvetica",
      cellPadding: 1.8,
    },
  });

  return doc.output("blob");
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
