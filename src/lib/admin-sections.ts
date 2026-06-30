import type { CurrentUserProfile } from "@/lib/user-profile";

export const ADMIN_SECTIONS = [
  "solicitacoes",
  "assinadas",
  "backup",
  "controle_assinaturas",
  "conversas",
  "whatsapp_usuarios",
  "cadastros",
  "configuracoes",
  "controle_entradas",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

function isAdminSection(value: string): value is AdminSection {
  return (ADMIN_SECTIONS as readonly string[]).includes(value);
}

export function getAdminSections(profile: Pick<CurrentUserProfile, "is_admin" | "categorias_permitidas"> | null) {
  if (!profile?.is_admin) return [];
  const rawSections = Array.isArray(profile.categorias_permitidas)
    ? profile.categorias_permitidas
    : [];

  return rawSections
    .map((value) => String(value).trim())
    .filter(isAdminSection);
}

export function isLimitedAdmin(profile: Pick<CurrentUserProfile, "is_admin" | "categorias_permitidas"> | null) {
  return profile?.is_admin === true && getAdminSections(profile).length > 0;
}

export function hasAdminSectionAccess(
  profile: Pick<CurrentUserProfile, "is_admin" | "categorias_permitidas"> | null,
  section: AdminSection,
) {
  if (!profile?.is_admin) return false;

  const sections = getAdminSections(profile);
  if (!sections.length) return true;

  return sections.includes(section);
}

export function getAdminSectionFromPath(pathname: string): AdminSection | null {
  if (pathname.startsWith("/admin/solicitacoes")) return "solicitacoes";
  if (pathname.startsWith("/admin/assinadas")) return "assinadas";
  if (pathname.startsWith("/admin/backup")) return "backup";
  if (pathname.startsWith("/admin/controle-assinaturas")) return "controle_assinaturas";
  if (pathname.startsWith("/admin/conversas")) return "conversas";
  if (pathname.startsWith("/admin/whatsapp-usuarios")) return "whatsapp_usuarios";
  if (pathname.startsWith("/admin/cadastros")) return "cadastros";
  if (pathname.startsWith("/admin/configuracoes")) return "configuracoes";
  if (pathname.startsWith("/admin/controle-entradas")) return "controle_entradas";

  return null;
}
