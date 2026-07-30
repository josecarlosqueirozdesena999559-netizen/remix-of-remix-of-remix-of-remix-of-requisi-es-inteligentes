export const LINKED_OUTPUT_DATE_COLUMN = "saida_vinculada_data";

export function isMissingLinkedOutputDateColumnError(message?: string | null) {
  return String(message || "").toLowerCase().includes(LINKED_OUTPUT_DATE_COLUMN);
}

export function withLinkedOutputDateFallback<T extends { saida_vinculada_data?: string | null }>(
  rows: T[] | null | undefined,
) {
  return (rows ?? []).map((row) => ({
    ...row,
    saida_vinculada_data: row.saida_vinculada_data ?? null,
  }));
}
