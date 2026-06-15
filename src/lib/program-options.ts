import { normalizeProductSearchValue } from "@/lib/product-options";

const PROGRAM_LABELS: Record<string, string> = {
  "atencao basica": "ATENÇÃO BÁSICA",
  hospital: "HOSPITAL",
  odontologico: "ODONTOLÓGICO",
  sesb: "SESB",
  fisioterapia: "FISIOTERAPIA",
  endemias: "ENDEMIAS",
  "casa de apoio": "CASA DE APOIO",
  "secretaria de saude": "SECRETARIA DE SAÚDE",
  "vigilancia sanitaria": "VIGILÂNCIA SANITÁRIA",
  samu: "SAMU",
};

const PROGRAM_EQUIVALENTS: Record<string, string[]> = {
  "atencao basica": ["atencao basica", "samu"],
  samu: ["samu", "atencao basica"],
};

export function normalizeProgramKey(value: string | null | undefined) {
  const normalized = normalizeProductSearchValue(value);

  if (normalized.startsWith("aten") || normalized.includes("atencao")) {
    return "atencao basica";
  }

  if (normalized.includes("odonto")) return "odontologico";
  if (normalized.includes("secretaria") && normalized.includes("saude")) return "secretaria de saude";
  if (normalized.includes("vigilancia") && normalized.includes("sanitaria")) return "vigilancia sanitaria";
  if (normalized.includes("casa") && normalized.includes("apoio")) return "casa de apoio";

  return normalized;
}

export function formatProgramName(value: string | null | undefined) {
  const key = normalizeProgramKey(value);
  if (!key) return "";

  return PROGRAM_LABELS[key] ?? String(value || "").trim();
}

export function getRelatedProgramKeys(value: string | null | undefined) {
  const key = normalizeProgramKey(value);
  if (!key) return [];

  return PROGRAM_EQUIVALENTS[key] ?? [key];
}
