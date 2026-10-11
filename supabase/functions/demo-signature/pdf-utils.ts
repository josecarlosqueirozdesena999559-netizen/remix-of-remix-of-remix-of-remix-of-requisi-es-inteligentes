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

export function formatProgramName(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  let key = normalized;
  if (normalized.startsWith("aten") || normalized.includes("atencao")) key = "atencao basica";
  else if (normalized.includes("odonto")) key = "odontologico";
  else if (normalized.includes("secretaria") && normalized.includes("saude"))
    key = "secretaria de saude";
  else if (normalized.includes("vigilancia") && normalized.includes("sanitaria"))
    key = "vigilancia sanitaria";
  else if (normalized.includes("casa") && normalized.includes("apoio")) key = "casa de apoio";
  return key ? (PROGRAM_LABELS[key] ?? String(value || "").trim()) : "";
}
