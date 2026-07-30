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
