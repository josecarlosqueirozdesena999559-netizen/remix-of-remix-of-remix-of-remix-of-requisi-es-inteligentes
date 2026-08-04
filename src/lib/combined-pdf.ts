import { PDFDocument } from "pdf-lib";

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Não foi possível carregar o documento.");
  }

  return await response.arrayBuffer();
}

async function appendPdf(target: PDFDocument, sourceUrl: string) {
  const sourceBytes = await fetchArrayBuffer(sourceUrl);
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const pages = await target.copyPages(source, source.getPageIndices());
  pages.forEach((page) => target.addPage(page));
}

export async function createCombinedSignedPdfBlob(outputUrls: string | string[], requestUrl: string) {
  const outputUrlList = Array.isArray(outputUrls) ? outputUrls.filter(Boolean) : outputUrls ? [outputUrls] : [];

  if (outputUrlList.length === 0 && !requestUrl) {
    throw new Error("Nenhum documento encontrado para juntar.");
  }

  const combined = await PDFDocument.create();

  for (const outputUrl of outputUrlList) {
    await appendPdf(combined, outputUrl);
  }

  if (requestUrl) {
    await appendPdf(combined, requestUrl);
  }

  const bytes = await combined.save();
  return new Blob([bytes], { type: "application/pdf" });
}
