export interface RequestOwnerProfile {
  cpf?: string | null;
  nome?: string | null;
  usuario?: string | null;
  email?: string | null;
  setor?: string | null;
  unidade_nome?: string | null;
}

export function getRequestOwnerCpf(profile: RequestOwnerProfile | null | undefined) {
  const cpf = profile?.cpf?.trim();
  return cpf || "";
}

export function onlyCpfDigits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

export function formatCpfDigits(value: string | null | undefined) {
  const digits = onlyCpfDigits(value);
  if (digits.length !== 11) return "";

  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}

export function getRequestOwnerCpfVariants(profile: RequestOwnerProfile | null | undefined) {
  const rawCpf = getRequestOwnerCpf(profile);
  const digitsCpf = onlyCpfDigits(rawCpf);
  const formattedCpf = formatCpfDigits(rawCpf);

  return Array.from(new Set([rawCpf, digitsCpf, formattedCpf].filter(Boolean)));
}

export function getRequestOwnerLocation(profile: RequestOwnerProfile | null | undefined) {
  const location = profile?.unidade_nome?.trim() || profile?.setor?.trim() || "";
  return location;
}

export function hasRequestOwnerIdentity(profile: RequestOwnerProfile | null | undefined) {
  return Boolean(
    getRequestOwnerCpf(profile) ||
      (profile?.nome?.trim() && getRequestOwnerLocation(profile)),
  );
}
