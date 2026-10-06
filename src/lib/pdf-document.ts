import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const PDF_LOGO_PATH = "/pdf/logo-pereiro-pdf.jpeg";
const PDF_MARGIN = 15;
const PDF_FOOTER_RESERVED = 24;
const PDF_ORGANIZATION = "Prefeitura Municipal de Pereiro";
const PDF_DEPARTMENT = "Fundo Municipal de Saúde";
const PDF_SYSTEM_NAME = "Sistema Integrado Gestor";
const PDF_SYSTEM_MODULE = "Módulo Almoxarifado";

let pdfLogoDataUrlPromise: Promise<string | null> | null = null;

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

type PdfInfoCell = string | { content: string; colSpan?: number };

export interface PdfInfoField {
  label: string;
  value?: string | number | null;
  fullWidth?: boolean;
}

export interface PdfTableColumn {
  title: string;
  width: number;
  align?: "left" | "center" | "right";
}

export interface PdfTable {
  columns: PdfTableColumn[];
  rows: Array<Array<string | number | null | undefined>>;
  emptyRow?: Array<string | number | null | undefined>;
  fontSize?: number;
  sectionTitle?: string;
}

export interface PdfSignatureBlock {
  label: string;
  name?: string | null;
  identifier?: string | null;
  printedText?: string | null;
}

export interface AdministrativePdfConfig {
  title: string;
  orientation?: "portrait" | "landscape";
  subject?: string;
  documentInfo?: PdfInfoField[];
  additionalInfo?: PdfInfoField[];
  table?: PdfTable;
  signatures?: PdfSignatureBlock[];
  website?: string | null;
  contactNumber?: string | null;
}

export function toPdfText(value: unknown) {
  const normalized = String(value ?? "").normalize("NFC");
  return Array.from(normalized)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint === 9 || codePoint === 10 || codePoint === 13) return " ";
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127 ? character : "";
    })
    .join("");
}

function getTextLines(doc: jsPDF, value: string, width: number) {
  const lines = doc.splitTextToSize(value, width);
  return Array.isArray(lines) ? lines : [String(lines)];
}

function getHeaderLayout(doc: jsPDF, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const titleX = PDF_MARGIN + 21;
  const titleWidth = pageWidth - PDF_MARGIN - titleX;
  const titleY = 30.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  const titleLines = getTextLines(doc, toPdfText(title).toLocaleUpperCase("pt-BR"), titleWidth);
  const logoBottom = 10 + 20;
  const titleBottom = titleY + Math.max(titleLines.length, 1) * 5.1;
  const ruleY = Math.max(logoBottom, titleBottom) + 3;

  return {
    titleLines,
    titleX,
    titleY,
    titleWidth,
    ruleY,
    contentTop: ruleY + 5,
  };
}

function drawPageHeader(doc: jsPDF, title: string, logoDataUrl: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const layout = getHeaderLayout(doc, title);
  const textX = PDF_MARGIN + 21;

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "JPEG", PDF_MARGIN, 10, 16.5, 19.1);
  }

  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.2);
  doc.text(toPdfText(PDF_ORGANIZATION), textX, 13.5, { maxWidth: layout.titleWidth });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.6);
  doc.text(toPdfText(PDF_DEPARTMENT), textX, 18.7, { maxWidth: layout.titleWidth });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.1);
  doc.text(toPdfText(`${PDF_SYSTEM_NAME} · ${PDF_SYSTEM_MODULE}`), textX, 23.2, {
    maxWidth: layout.titleWidth,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.8);
  doc.text(layout.titleLines, layout.titleX, layout.titleY, { maxWidth: layout.titleWidth });

  doc.setDrawColor(155, 160, 165);
  doc.setLineWidth(0.25);
  doc.line(PDF_MARGIN, layout.ruleY, pageWidth - PDF_MARGIN, layout.ruleY);
}

export function formatPdfPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return toPdfText(value);
}

function drawPageFooter(
  doc: jsPDF,
  pageNumber: number,
  totalPages: number,
  website?: string | null,
  contactNumber?: string | null,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN * 2;
  const lineY = pageHeight - 19.5;
  const pageLabelWidth = 34;
  const leftWidth = contentWidth - pageLabelWidth - 4;
  const detailParts = [
    website?.trim(),
    contactNumber?.trim() ? `Contato: ${formatPdfPhone(contactNumber)}` : "",
  ].filter(Boolean);
  const detailText = detailParts.join(" · ");

  doc.setDrawColor(175, 179, 184);
  doc.setLineWidth(0.2);
  doc.line(PDF_MARGIN, lineY, pageWidth - PDF_MARGIN, lineY);

  doc.setTextColor(75, 75, 75);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.1);
  doc.text(toPdfText(`${PDF_SYSTEM_NAME} · ${PDF_SYSTEM_MODULE}`), PDF_MARGIN, pageHeight - 13.5, {
    maxWidth: leftWidth,
  });

  if (detailText) {
    doc.setFontSize(6.8);
    const detailLines = getTextLines(doc, toPdfText(detailText), leftWidth);
    doc.text(detailLines, PDF_MARGIN, pageHeight - 8.4, { maxWidth: leftWidth });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.1);
  doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - PDF_MARGIN, pageHeight - 8.4, {
    align: "right",
  });
}

function normalizeFields(fields: PdfInfoField[]) {
  return fields
    .map((field) => ({
      ...field,
      label: toPdfText(field.label).trim(),
      value: toPdfText(field.value).trim(),
    }))
    .filter((field) => field.label && field.value);
}

function buildInfoRows(fields: PdfInfoField[]): PdfInfoCell[][] {
  const normalizedFields = normalizeFields(fields);
  const regularFields = normalizedFields.filter((field) => !field.fullWidth);
  const fullWidthFields = normalizedFields.filter((field) => field.fullWidth);
  const rows: PdfInfoCell[][] = [];

  for (let index = 0; index < regularFields.length; index += 2) {
    const first = regularFields[index];
    const second = regularFields[index + 1];
    rows.push([
      { content: first.label },
      { content: first.value },
      second ? { content: second.label } : "",
      second ? { content: second.value } : "",
    ]);
  }

  for (const field of fullWidthFields) {
    rows.push([{ content: field.label }, { content: field.value, colSpan: 3 }]);
  }

  return rows;
}

function drawSectionHeading(doc: jsPDF, title: string, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(toPdfText(title).toLocaleUpperCase("pt-BR"), PDF_MARGIN, y + 3.5);
  doc.setDrawColor(190, 194, 198);
  doc.setLineWidth(0.18);
  doc.line(PDF_MARGIN, y + 5.2, pageWidth - PDF_MARGIN, y + 5.2);
  return y + 8;
}

function addSectionStart(doc: jsPDF, y: number, headerReserve: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + 19 <= pageHeight - PDF_FOOTER_RESERVED) return y;
  doc.addPage();
  return headerReserve + 4;
}

function addInfoSection(
  doc: JsPdfWithAutoTable,
  title: string,
  fields: PdfInfoField[],
  startY: number,
  headerReserve: number,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_MARGIN * 2;
  const rows = buildInfoRows(fields);
  if (rows.length === 0) return startY;

  let y = addSectionStart(doc, startY, headerReserve);
  y = drawSectionHeading(doc, title, y);

  const labelWidth = Math.min(34, Math.max(27, contentWidth * 0.17));
  const valueWidth = (contentWidth - labelWidth * 2) / 2;
  autoTable(doc, {
    startY: y,
    head: [],
    body: rows,
    theme: "grid",
    margin: {
      left: PDF_MARGIN,
      right: PDF_MARGIN,
      top: headerReserve,
      bottom: PDF_FOOTER_RESERVED,
    },
    styles: {
      font: "helvetica",
      fontSize: 8.2,
      textColor: [30, 30, 30],
      lineColor: [195, 199, 203],
      lineWidth: 0.15,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: labelWidth, fontStyle: "bold", fillColor: [247, 248, 249] },
      1: { cellWidth: valueWidth },
      2: { cellWidth: labelWidth, fontStyle: "bold", fillColor: [247, 248, 249] },
      3: { cellWidth: valueWidth },
    },
    rowPageBreak: "auto",
  });

  return (doc.lastAutoTable?.finalY ?? y) + 4;
}

function getSignatureBlockLayout(doc: jsPDF, signature: PdfSignatureBlock, width: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  const labelLines = getTextLines(doc, toPdfText(signature.label), width - 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const nameLines = signature.name?.trim()
    ? getTextLines(doc, toPdfText(signature.name), width - 3)
    : [];
  doc.setFontSize(7.1);
  const detail = signature.identifier || signature.printedText || "";
  const detailLines = detail ? getTextLines(doc, toPdfText(detail), width - 3) : [];

  const labelHeight = labelLines.length * 3.25;
  const nameHeight = nameLines.length * 3.6;
  const detailHeight = detailLines.length * 3.2;
  return {
    labelLines,
    nameLines,
    detailLines,
    labelHeight,
    nameHeight,
    detailHeight,
    height: labelHeight + 4 + 6 + nameHeight + detailHeight + 4,
  };
}

function drawSignatureArea(
  doc: jsPDF,
  signatures: PdfSignatureBlock[],
  finalY: number,
  headerReserve: number,
) {
  if (signatures.length === 0) return;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN * 2;
  const gap = 6;
  const blockWidth = (contentWidth - gap * (signatures.length - 1)) / signatures.length;
  const layouts = signatures.map((signature) =>
    getSignatureBlockLayout(doc, signature, blockWidth),
  );
  const sectionHeight = 10 + Math.max(...layouts.map((layout) => layout.height));
  let topY = finalY + 6;

  if (topY + sectionHeight > pageHeight - PDF_FOOTER_RESERVED) {
    doc.addPage();
    topY = headerReserve + 5;
  }

  doc.setTextColor(35, 35, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("ASSINATURAS", PDF_MARGIN, topY + 3.5);
  doc.setDrawColor(190, 194, 198);
  doc.setLineWidth(0.18);
  doc.line(PDF_MARGIN, topY + 5.2, pageWidth - PDF_MARGIN, topY + 5.2);

  signatures.forEach((signature, index) => {
    const layout = layouts[index];
    const x = PDF_MARGIN + index * (blockWidth + gap);
    const blockTop = topY + 9;
    const labelY = blockTop + 3.2;
    doc.setTextColor(45, 45, 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text(layout.labelLines, x, labelY, { maxWidth: blockWidth - 3 });

    const lineY = blockTop + layout.labelHeight + 7;
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.25);
    doc.line(x + 1, lineY, x + blockWidth - 1, lineY);

    let textY = lineY + 4.2;
    if (layout.nameLines.length > 0) {
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(layout.nameLines, x, textY, { maxWidth: blockWidth - 3 });
      textY += layout.nameHeight;
    }

    if (layout.detailLines.length > 0) {
      doc.setTextColor(75, 75, 75);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.1);
      doc.text(layout.detailLines, x, textY + (layout.nameLines.length > 0 ? 1.2 : 0), {
        maxWidth: blockWidth - 3,
      });
    }
  });
}

async function loadPdfLogoDataUrl() {
  if (!pdfLogoDataUrlPromise) {
    pdfLogoDataUrlPromise = fetch(PDF_LOGO_PATH)
      .then(async (response) => {
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Não foi possível ler a logo do PDF."));
          reader.readAsDataURL(blob);
        });
      })
      .catch(() => null);
  }

  return pdfLogoDataUrlPromise;
}

export async function createAdministrativePdfBlob(config: AdministrativePdfConfig) {
  const orientation = config.orientation ?? "portrait";
  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
    compress: true,
  }) as JsPdfWithAutoTable;
  const logoDataUrl = await loadPdfLogoDataUrl();
  const headerLayout = getHeaderLayout(doc, config.title);
  const headerReserve = headerLayout.contentTop;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_MARGIN * 2;

  doc.setProperties({
    title: toPdfText(config.title),
    subject: toPdfText(config.subject || config.title),
    creator: `${PDF_SYSTEM_NAME} · ${PDF_SYSTEM_MODULE}`,
  });

  let currentY = headerReserve + 4;
  currentY = addInfoSection(
    doc,
    "DADOS DO DOCUMENTO",
    config.documentInfo ?? [],
    currentY,
    headerReserve,
  );
  currentY = addInfoSection(
    doc,
    "INFORMAÇÕES COMPLEMENTARES",
    config.additionalInfo ?? [],
    currentY,
    headerReserve,
  );

  if (config.table) {
    currentY = addSectionStart(doc, currentY, headerReserve);
    currentY = drawSectionHeading(doc, config.table.sectionTitle || "REGISTROS", currentY);
    const emptyRow = config.table.emptyRow ?? config.table.columns.map(() => "—");
    const tableRows = config.table.rows.length ? config.table.rows : [emptyRow];

    autoTable(doc, {
      startY: currentY,
      head: [config.table.columns.map((column) => toPdfText(column.title))],
      body: tableRows.map((row) =>
        config.table!.columns.map((_, index) => toPdfText(row[index] ?? "—")),
      ),
      theme: "grid",
      margin: {
        left: PDF_MARGIN,
        right: PDF_MARGIN,
        top: headerReserve,
        bottom: PDF_FOOTER_RESERVED,
      },
      showHead: "everyPage",
      rowPageBreak: "auto",
      styles: {
        font: "helvetica",
        fontSize: config.table.fontSize ?? 8,
        textColor: [25, 25, 25],
        lineColor: [190, 194, 198],
        lineWidth: 0.15,
        cellPadding: 1.8,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [243, 244, 245],
        textColor: [20, 20, 20],
        fontStyle: "bold",
        lineColor: [165, 169, 173],
        lineWidth: 0.2,
        fontSize: config.table.fontSize ?? 8,
        halign: "center",
      },
      columnStyles: Object.fromEntries(
        config.table.columns.map((column, index) => [
          index,
          {
            cellWidth: Math.min(column.width, contentWidth),
            halign: column.align ?? "left",
          },
        ]),
      ),
    });

    currentY = doc.lastAutoTable?.finalY ?? currentY;
  }

  drawSignatureArea(doc, config.signatures ?? [], currentY, headerReserve);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPageHeader(doc, config.title, logoDataUrl);
    drawPageFooter(doc, page, totalPages, config.website, config.contactNumber);
  }

  return doc.output("blob");
}
