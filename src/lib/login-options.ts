import { supabase } from "@/integrations/supabase/client";

export type SectorLoginUser = {
  id: string;
  personName: string;
  login: string;
  requesterId: string | null;
  isShared: boolean;
  isAdmin?: boolean;
};

export type LoginSector = {
  key: string;
  name: string;
  displayName?: string;
  adminUser?: SectorLoginUser;
};

function normalizeLoginSearch(query: string) {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isAdminGroupSearch(query: string) {
  const normalized = normalizeLoginSearch(query);
  return normalized.startsWith("adm") || normalized === "alamo";
}

export async function searchLoginSectors(query: string): Promise<LoginSector[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  if (isAdminGroupSearch(normalizedQuery)) {
    const administrators = await searchLoginUsersBySector("__system_admins__");
    const normalizedSearch = normalizeLoginSearch(normalizedQuery);
    const matchingAdministrators = normalizedSearch.startsWith("adm")
      ? administrators
      : administrators.filter(
          (admin) =>
            normalizeLoginSearch(admin.personName).includes(normalizedSearch) ||
            normalizeLoginSearch(admin.login).includes(normalizedSearch),
        );

    return matchingAdministrators.map((admin) => ({
      key: `admin:${admin.login.toLowerCase()}`,
      name: admin.login,
      displayName: `Admin — ${admin.login}`,
      adminUser: { ...admin, isAdmin: true },
    }));
  }

  const { data, error } = await supabase.rpc("search_login_sectors", {
    p_query: normalizedQuery,
  });

  if (error) throw new Error(error.message || "Não foi possível buscar os setores.");

  return (data ?? [])
    .map((row) => ({
      key: row.sector_key.trim(),
      name: row.sector_name.trim(),
    }))
    .filter((sector) => sector.key && sector.name);
}

export async function searchLoginUsersBySector(sectorKey: string): Promise<SectorLoginUser[]> {
  const normalizedSectorKey = sectorKey.trim();
  if (!normalizedSectorKey) return [];

  const { data, error } = await supabase.rpc("search_login_people_by_sector", {
    p_sector_key: normalizedSectorKey,
  });

  if (error) throw new Error(error.message || "Não foi possível buscar os usuários do setor.");

  return (data ?? [])
    .map((row) => {
      const login = row.login_usuario.trim();
      const requesterId = row.requester_id;

      return {
        id: requesterId ? `shared:${requesterId}` : `login:${login.toLowerCase()}`,
        personName: row.person_name.trim(),
        login,
        requesterId,
        isShared: Boolean(requesterId),
        isAdmin: false,
      };
    })
    .filter((user) => user.personName && user.login);
}

export async function resolveLoginEmail(login: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_login_email", {
    p_usuario: login,
  });

  if (error) throw new Error(error.message || "Não foi possível validar o usuário.");
  return typeof data === "string" && data.trim() ? data : null;
}
