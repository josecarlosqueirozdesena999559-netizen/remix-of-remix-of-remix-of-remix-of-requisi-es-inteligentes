export const LINKED_OUTPUT_DATE_COLUMN = "saida_vinculada_data";

export function isMissingLinkedOutputDateColumnError(message?: string | null) {
  return String(message || "")
    .toLowerCase()
    .includes(LINKED_OUTPUT_DATE_COLUMN);
}

export function withLinkedOutputDateFallback<T extends { saida_vinculada_data?: string | null }>(
  rows: T[] | null | undefined,
) {
  return (rows ?? []).map((row) => ({
    ...row,
    saida_vinculada_data: row.saida_vinculada_data ?? null,
  }));
}

export function formatOutputDate(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }
  return value;
}

export function omitLinkedOutputDateFields<T extends Record<string, unknown>>(payload: T) {
  const { saida_vinculada_data: _saidaVinculadaData, ...rest } = payload;
  return rest;
}
