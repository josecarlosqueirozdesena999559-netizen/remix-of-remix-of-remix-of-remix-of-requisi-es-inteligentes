import type { CurrentUserProfile } from "@/lib/user-profile";

export const DYELSSE_HOSPITAL_USER = "dyelssehospital";
export const DYELSSE_HOSPITAL_NAME = "dyelsse larissa dos santos";
export const HOSPITAL_SHARED_EMAIL = "hospital@usuarios.solicite.local";

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** The automatic digital-signature flow is restricted to Dyelsse in Hospital. */
export function isDemoSignatureUser(
  user: { id?: string; email?: string | null } | null | undefined,
  profile: CurrentUserProfile | null | undefined,
) {
  return Boolean(
    user?.id &&
    normalize(user.email) === HOSPITAL_SHARED_EMAIL &&
    normalize(profile?.usuario) === DYELSSE_HOSPITAL_USER &&
    normalize(profile?.nome) === DYELSSE_HOSPITAL_NAME &&
    normalize(profile?.unidade_nome) === "hospital" &&
    !profile?.is_admin,
  );
}
