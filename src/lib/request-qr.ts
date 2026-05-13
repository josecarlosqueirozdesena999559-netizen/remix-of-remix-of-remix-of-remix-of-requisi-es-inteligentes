import QRCode from "qrcode";

import { formatProgramName } from "@/lib/program-options";
import type { RequestPdfData } from "@/lib/request-pdf";

export interface RequestQrPayload {
  kind: "almoxarifado_requisicao";
  version: 1;
  requestId: string;
  requestCode: string;
  materialType: string;
  program: string;
  requester: string;
  requesterCpf: string;
  requestDate: string;
}

function valueOrDash(value: string | null | undefined) {
  return value?.trim() || "-";
}

export function buildRequestQrPayload(request: RequestPdfData): RequestQrPayload {
  return {
    kind: "almoxarifado_requisicao",
    version: 1,
    requestId: request.id,
    requestCode: valueOrDash(request.saida_codigo || request.id),
    materialType: valueOrDash(request.categoria),
    program: valueOrDash(formatProgramName(request.programa || request.setor)),
    requester: valueOrDash(request.requesterDisplayName || request.solicitante),
    requesterCpf: valueOrDash(request.requesterDisplayCpf || request.solicitante_cpf),
    requestDate: valueOrDash(request.data),
  };
}

export function parseRequestQrPayload(value: string): RequestQrPayload {
  const parsed = JSON.parse(value) as Partial<RequestQrPayload>;

  if (
    parsed.kind !== "almoxarifado_requisicao" ||
    parsed.version !== 1 ||
    !parsed.requestId ||
    typeof parsed.requestId !== "string"
  ) {
    throw new Error("QR Code de requisição inválido.");
  }

  return {
    kind: "almoxarifado_requisicao",
    version: 1,
    requestId: parsed.requestId,
    requestCode: valueOrDash(parsed.requestCode),
    materialType: valueOrDash(parsed.materialType),
    program: valueOrDash(parsed.program),
    requester: valueOrDash(parsed.requester),
    requesterCpf: valueOrDash(parsed.requesterCpf),
    requestDate: valueOrDash(parsed.requestDate),
  };
}

export function stringifyRequestQrPayload(payload: RequestQrPayload) {
  return JSON.stringify(payload);
}

export async function createRequestQrDataUrl(request: RequestPdfData) {
  return QRCode.toDataURL(stringifyRequestQrPayload(buildRequestQrPayload(request)), {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 6,
    type: "image/png",
  });
}
