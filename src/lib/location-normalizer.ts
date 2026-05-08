export interface LocationOption {
  nome: string;
  programa?: string | null;
}

function stripCommonPrefixes(value: string) {
  return value
    .replace(/\bubs\b/g, " ")
    .replace(/\bhospital municipal\b/g, " ")
    .replace(/\bhospital\b/g, " ")
    .replace(/\bsecretaria de saude\b/g, " ")
    .replace(/\bunidade basica de saude\b/g, " ");
}

export function normalizeLocationKey(value?: string | null) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return stripCommonPrefixes(normalized)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCanonicalLocationOption(
  value: string | null | undefined,
  options: LocationOption[],
) {
  const key = normalizeLocationKey(value);
  if (!key) return null;

  const normalizedOptions = options
    .filter((option) => option.nome?.trim())
    .map((option) => ({
      option,
      key: normalizeLocationKey(option.nome),
    }))
    .filter((entry) => entry.key);

  const exactMatch = normalizedOptions.find((entry) => entry.key === key);
  if (exactMatch) return exactMatch.option;

  const partialMatches = normalizedOptions.filter(
    (entry) => entry.key.includes(key) || key.includes(entry.key),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0].option;
  }

  return null;
}

export function resolveCanonicalLocationName(
  value: string | null | undefined,
  options: LocationOption[],
) {
  return resolveCanonicalLocationOption(value, options)?.nome?.trim() || String(value || "").trim();
}

export function resolveCanonicalLocationNameFromCandidates(
  values: Array<string | null | undefined>,
  options: LocationOption[],
  fallback = "Sem localidade",
) {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;

    const canonical = resolveCanonicalLocationName(trimmed, options);
    if (canonical) return canonical;
    return trimmed;
  }

  return fallback;
}
