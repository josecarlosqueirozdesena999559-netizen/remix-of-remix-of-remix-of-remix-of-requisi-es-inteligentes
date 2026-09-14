export interface RequestCodeSource {
  id: string;
  saida_codigo: string | null;
  data: string | null;
  created_at: string;
}

export function parseRequestDate(value?: string | null) {
  const raw = String(value || "").trim();
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const parsed = new Date(Number(brMatch[3]), Number(brMatch[2]) - 1, Number(brMatch[1]));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function formatRequestCodeDate(value?: string | null) {
  const date = parseRequestDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${day}${month}${year}`;
}

export function buildGlobalRequestCodes(requests: RequestCodeSource[]) {
  const sorted = [...requests].sort((left, right) => {
    const leftTime = parseRequestDate(left.created_at || left.data).getTime();
    const rightTime = parseRequestDate(right.created_at || right.data).getTime();
    return leftTime - rightTime || left.id.localeCompare(right.id);
  });

  return new Map(
    sorted.map((request, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      return [
        request.id,
        request.saida_codigo ||
          `${formatRequestCodeDate(request.data || request.created_at)}${sequence}`,
      ];
    }),
  );
}

export function getRequestFileName(code: string) {
  return `Requisição_${code}.pdf`;
}
