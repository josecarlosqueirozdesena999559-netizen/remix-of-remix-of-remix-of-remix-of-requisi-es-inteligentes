import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatProgramName } from "@/lib/program-options";

const PDF_LOGO_PATH = "/pdf/logo-pereiro-pdf.jpeg";
const PDF_MARGIN = 14;
const PDF_TABLE_START_Y = 86;
const PDF_PAGE_BOTTOM_MARGIN = 6;
const PDF_SIGNATURE_SECTION_HEIGHT = 58;
const PDF_SIGNATURE_SECTION_GAP = 6;
const PDF_SIGNATURE_PAGE_START_Y = 24;

const WAREHOUSE_RESPONSIBLE_NAME = "JOSE CARLOS QUEIROZ DE SENA";
const WAREHOUSE_RESPONSIBLE_CPF = "07465636396";
const WAREHOUSE_RESPONSIBLE_ROLE = "Responsável pelo almoxarifado";

let pdfLogoDataUrlPromise: Promise<string | null> | null = null;

type JsPdfWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export interface RequestPdfItem {
  item?: string | null;
  nome?: string | null;
  description?: string | null;
  descricao?: string | null;
  unit?: string | null;
  unidade?: string | null;
  stock?: string | number | null;
  qtdDisponivel?: string | number | null;
  need?: string | number | null;
  qtdNecessaria?: string | number | null;
  quantidade_solicitada?: string | number | null;
  categoria?: string | null;
  subcategoria?: string | null;
  request_section?: string | null;
}

export interface RequestPdfData {
  id: string;
  saida_codigo?: string | null;
  categoria?: string | null;
  data?: string | null;
  setor?: string | null;
  programa?: string | null;
  solicitante?: string | null;
  solicitante_cpf?: string | null;
  solicitante_funcao?: string | null;
  requesterDisplayName?: string | null;
  requesterDisplayCpf?: string | null;
  requesterDisplayRole?: string | null;
  items?: RequestPdfItem[] | null;
}

function toPdfAscii(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "");
}

function getRequestCode(request: RequestPdfData) {
  return request.saida_codigo || request.id;
}

function getRequestPdfName(code: string) {
  return `Solicitação ${code}.pdf`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function normalizeRequestItem(item: RequestPdfItem) {
  const itemName = String(item.item || item.nome || "-").trim();
  const itemDescription = String(item.description || item.descricao || itemName || "-").trim();
  const itemUnit = String(item.unit || item.unidade || "-").trim();

  return {
    ...item,
    item: itemName || "-",
    description: itemDescription || "-",
    unit: itemUnit || "-",
  };
}

function getRequestItemPdfDescription(item: ReturnType<typeof normalizeRequestItem>) {
  const itemName = String(item.item || "-").trim();
  const itemDescription = String(item.description || "").trim();

  if (
    itemDescription &&
    itemDescription !== "-" &&
    itemDescription.toLowerCase() !== itemName.toLowerCase()
  ) {
    return `${itemName} - ${itemDescription}`;
  }

  return itemName;
}

function normalizeQuantity(value: string | number | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .replace(",", ".");
  const quantity = Number(normalized);

  return Number.isFinite(quantity) ? quantity : 0;
}

function getRequestedQuantity(item: RequestPdfItem) {
  return item.need ?? item.qtdNecessaria ?? item.quantidade_solicitada ?? null;
}

function getActiveRequestItems(items?: RequestPdfItem[] | null) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    return normalizeQuantity(getRequestedQuantity(item)) > 0;
  });
}

function getRequestItemsForPdf(request: RequestPdfData) {
  return getActiveRequestItems(request.items).map((rawItem, index) => {
    const item = normalizeRequestItem(rawItem);

    return [
      toPdfAscii(index + 1),
      toPdfAscii(getRequestItemPdfDescription(item)),
      toPdfAscii(item.unit || "-"),
      toPdfAscii(item.stock ?? item.qtdDisponivel ?? "-"),
      toPdfAscii(getRequestedQuantity(item) ?? "-"),
      " ",
    ];
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

function drawRequestPdfHeader(
  doc: jsPDF,
  request: RequestPdfData,
  logoDataUrl: string | null,
  pageNumber: number,
  totalPages: number,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PDF_MARGIN * 2;
  const leftColX = PDF_MARGIN + 2;
  const rightColX = pageWidth - PDF_MARGIN;
  const lineY = 32;
  const requestDate = formatDate(request.data);
  const programa = formatProgramName(request.programa || request.setor) || "-";

  doc.setDrawColor(76, 124, 73);
  doc.setLineWidth(0.35);
  doc.roundedRect(PDF_MARGIN, 12, 18, 20, 2, 2);

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "JPEG", PDF_MARGIN + 1.2, 13.2, 15.6, 17.6);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("PM", PDF_MARGIN + 9, 24, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text(toPdfAscii("Prefeitura Municipal de Pereiro"), leftColX + 18, 18);
  doc.setFontSize(10.5);
  doc.text(toPdfAscii("FUNDO MUNICIPAL DE SAÚDE"), leftColX + 18, 25);
  doc.setFontSize(11);
  doc.text(toPdfAscii("Solicitação de Material"), leftColX + 18, 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(toPdfAscii(`Pag.: ${pageNumber}/${totalPages}`), rightColX, 18, { align: "right" });
  doc.text(toPdfAscii(`Data: ${requestDate}`), rightColX, 26, { align: "right" });
  doc.line(PDF_MARGIN, lineY + 6, pageWidth - PDF_MARGIN, lineY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(toPdfAscii("Almoxarifado:"), PDF_MARGIN, 45);
  doc.setFont("helvetica", "normal");
  doc.text(toPdfAscii("ALMOXARIFADO DA SAÚDE"), PDF_MARGIN + 22, 45);

  const headers = [
    { label: "Código", value: toPdfAscii(getRequestCode(request)) },
    { label: "Modalidade", value: toPdfAscii("Solicitação") },
    { label: "Data", value: toPdfAscii(requestDate) },
    { label: "Programa", value: toPdfAscii(programa) },
    { label: "Unidade requisitante", value: toPdfAscii(request.setor || "-") },
    {
      label: "Solicitante",
      value: toPdfAscii(request.requesterDisplayName || request.solicitante || "-"),
    },
  ];
  const widths = [22, 22, 18, 34, 42, contentWidth - 22 - 22 - 18 - 34 - 42];
  let currentX = PDF_MARGIN;

  headers.forEach((header, index) => {
    const width = widths[index];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.text(toPdfAscii(header.label), currentX + width / 2, 54, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(toPdfAscii(header.value), currentX + width / 2, 61, {
      align: "center",
      maxWidth: width - 2,
    });
    currentX += width;
  });

  doc.line(PDF_MARGIN, 56.5, pageWidth - PDF_MARGIN, 56.5);
  doc.line(PDF_MARGIN, 64.5, pageWidth - PDF_MARGIN, 64.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text(toPdfAscii(`Categorias: ${String(request.categoria || "-")}`), PDF_MARGIN, 72);
  doc.text(toPdfAscii(`Programa: ${programa}`), PDF_MARGIN, 79);

  const cpf = toPdfAscii(request.requesterDisplayCpf || request.solicitante_cpf || "-");
  if (cpf && cpf !== "-") {
    doc.text(toPdfAscii(`CPF: ${cpf}`), pageWidth - PDF_MARGIN, 72, { align: "right" });
  }
}

function drawSignatureBlock(
  doc: jsPDF,
  centerX: number,
  topY: number,
  name: string,
  cpf: string,
  roleLabel: string,
  showGovLabel = true,
) {
  const boxWidth = 76;
  const boxHeight = 18;
  const boxX = centerX - boxWidth / 2;

  if (showGovLabel) {
    doc.setDrawColor(190, 198, 210);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, topY, boxWidth, boxHeight, 1.5, 1.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.4);
    doc.setTextColor(71, 85, 105);
    doc.text(toPdfAscii("ASSINATURA GOV.BR"), centerX, topY + 6, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(107, 114, 128);
    doc.text(toPdfAscii("Assine neste campo"), centerX, topY + 11.8, { align: "center" });
  }

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.35);
  doc.line(centerX - 40, topY + 30, centerX + 40, topY + 30);

  doc.setTextColor(20, 24, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(toPdfAscii(name || "-"), centerX, topY + 37, { align: "center", maxWidth: 80 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.9);
  doc.text(toPdfAscii(`CPF: ${String(cpf || "-")}`), centerX, topY + 43, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  doc.text(toPdfAscii(roleLabel || "-"), centerX, topY + 49, { align: "center", maxWidth: 84 });
}

export async function createRequestPdfBlob(request: RequestPdfData) {
  const doc = new jsPDF() as JsPdfWithAutoTable;
  const logoDataUrl = await loadPdfLogoDataUrl();
  const bodyRows = getRequestItemsForPdf(request);

  doc.setProperties({
    title: getRequestPdfName(getRequestCode(request)),
    subject: "Solicitação de material",
    creator: "Sistema Almoxarifado",
  });

  autoTable(doc, {
    startY: PDF_TABLE_START_Y,
    head: [
      [
        toPdfAscii("Item"),
        toPdfAscii("Descrição"),
        toPdfAscii("Und."),
        toPdfAscii("Saldo Atual"),
        toPdfAscii("Qtd. Req."),
        toPdfAscii("Qtd. Forn."),
      ],
    ],
    body: bodyRows.length
      ? bodyRows
      : [["-", toPdfAscii("Nenhum item preenchido"), "-", "-", "-", "-"]],
    theme: "grid",
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, top: PDF_TABLE_START_Y, bottom: 16 },
    headStyles: {
      fillColor: [244, 244, 244],
      textColor: [10, 10, 10],
      fontStyle: "bold",
      halign: "center",
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      fontSize: 8.8,
    },
    bodyStyles: {
      fontSize: 8.6,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      valign: "middle",
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 80 },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 24, halign: "center" },
      5: { cellWidth: 24, halign: "center" },
    },
    styles: {
      overflow: "linebreak",
      cellPadding: 1.8,
      font: "helvetica",
    },
  });

  const finalY = doc.lastAutoTable?.finalY ?? PDF_TABLE_START_Y;
  const pageHeight = doc.internal.pageSize.getHeight();
  const signaturesNeedExtraPage =
    finalY + PDF_SIGNATURE_SECTION_GAP + PDF_SIGNATURE_SECTION_HEIGHT >
    pageHeight - PDF_PAGE_BOTTOM_MARGIN;

  if (signaturesNeedExtraPage) {
    doc.addPage();
  }

  const finalTotalPages = doc.getNumberOfPages();
  const pagesWithDocumentHeader = signaturesNeedExtraPage ? finalTotalPages - 1 : finalTotalPages;
  for (let page = 1; page <= finalTotalPages; page += 1) {
    doc.setPage(page);
    if (page > pagesWithDocumentHeader) continue;
    drawRequestPdfHeader(doc, request, logoDataUrl, page, finalTotalPages);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const footerTopY = signaturesNeedExtraPage
    ? PDF_SIGNATURE_PAGE_START_Y
    : finalY + PDF_SIGNATURE_SECTION_GAP;

  doc.setPage(finalTotalPages);
  drawSignatureBlock(
    doc,
    PDF_MARGIN + 40,
    footerTopY,
    request.requesterDisplayName || request.solicitante || "-",
    request.requesterDisplayCpf || request.solicitante_cpf || "-",
    request.requesterDisplayRole || request.solicitante_funcao || "Solicitante do setor",
  );
  drawSignatureBlock(
    doc,
    pageWidth - PDF_MARGIN - 40,
    footerTopY,
    WAREHOUSE_RESPONSIBLE_NAME,
    WAREHOUSE_RESPONSIBLE_CPF,
    WAREHOUSE_RESPONSIBLE_ROLE,
    false,
  );

  return doc.output("blob");
}

export async function openRequestPdf(request: RequestPdfData) {
  const targetWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
  const blob = await createRequestPdfBlob(request);
  const url = URL.createObjectURL(blob);

  if (targetWindow) {
    targetWindow.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return url;
}
