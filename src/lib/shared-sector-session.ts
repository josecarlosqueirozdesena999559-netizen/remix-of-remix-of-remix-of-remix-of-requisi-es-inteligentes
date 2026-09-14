import { supabase } from "@/integrations/supabase/client";
import { isSharedSectorProfile, type CurrentUserProfile } from "@/lib/user-profile";

const SELECTED_SHARED_REQUESTER_KEY = "soliciteja:selected-shared-requester-id";
const USER_SELECT =
  "id,auth_user_id,nome,usuario,email,cpf,funcao,setor,unidade_nome,whatsapp,is_admin,categorias_permitidas";

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getProfileLocation(profile: Pick<CurrentUserProfile, "setor" | "unidade_nome"> | null) {
  return normalize(profile?.unidade_nome || profile?.setor || "");
}

function canUseRequesterForSharedProfile(
  sharedProfile: CurrentUserProfile | null,
  requester: CurrentUserProfile | null,
  linkedUserIds: Set<string> = new Set(),
) {
  if (!sharedProfile || !requester) return false;
  if (isSharedSectorProfile(requester)) return false;

  const sharedLocation = getProfileLocation(sharedProfile);
  if (!sharedLocation) return false;

  return (
    linkedUserIds.has(requester.id) ||
    normalize(requester.unidade_nome) === sharedLocation ||
    normalize(requester.setor) === sharedLocation
  );
}

function applyCpfFallback(user: CurrentUserProfile, allUsers: CurrentUserProfile[]) {
  if (user.cpf?.trim()) return user;

  const cpfOwner = allUsers.find(
    (candidate) =>
      normalize(candidate.nome) === normalize(user.nome) && Boolean(candidate.cpf?.trim()),
  );

  return cpfOwner?.cpf ? { ...user, cpf: cpfOwner.cpf } : user;
}

async function getSharedSectorLinkedUserIds(sharedProfile: CurrentUserProfile | null) {
  const sharedLocation = getProfileLocation(sharedProfile);
  if (!sharedLocation) return new Set<string>();

  const { data: sectors, error: sectorsError } = await supabase.from("setores").select("id,nome");

  if (sectorsError) throw new Error(sectorsError.message);

  const sectorIds = ((sectors ?? []) as { id: number; nome: string | null }[])
    .filter((sector) => normalize(sector.nome) === sharedLocation)
    .map((sector) => sector.id);

  if (sectorIds.length === 0) return new Set<string>();

  const { data, error } = await supabase
    .from("setor_responsaveis")
    .select("usuario_id")
    .in("setor_id", sectorIds);

  if (error) throw new Error(error.message);

  return new Set(
    ((data ?? []) as { usuario_id: string | null }[])
      .map((link) => link.usuario_id)
      .filter((id): id is string => Boolean(id)),
  );
}

export function getSelectedSharedRequesterId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SELECTED_SHARED_REQUESTER_KEY) || "";
}

export function setSelectedSharedRequesterId(requesterId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELECTED_SHARED_REQUESTER_KEY, requesterId);
}

export function clearSelectedSharedRequesterId() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SELECTED_SHARED_REQUESTER_KEY);
}

export async function getSharedSectorUsers(sharedProfile: CurrentUserProfile | null) {
  if (!isSharedSectorProfile(sharedProfile)) return [];

  const sharedLocation = getProfileLocation(sharedProfile);
  if (!sharedLocation) return [];

  const [usersResult, linkedUserIds] = await Promise.all([
    supabase.from("usuarios").select(USER_SELECT).order("nome", {
      ascending: true,
    }),
    getSharedSectorLinkedUserIds(sharedProfile),
  ]);

  if (usersResult.error) throw new Error(usersResult.error.message);

  const allUsers = (usersResult.data ?? []) as CurrentUserProfile[];
  const seen = new Set<string>();

  return allUsers
    .filter((user) => canUseRequesterForSharedProfile(sharedProfile, user, linkedUserIds))
    .map((user) => applyCpfFallback(user, allUsers))
    .filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    })
    .sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR", { sensitivity: "base" }));
}

export async function getSelectedSharedRequesterProfile(sharedProfile: CurrentUserProfile | null) {
  if (!isSharedSectorProfile(sharedProfile)) return sharedProfile;

  const requesterId = getSelectedSharedRequesterId();
  if (!requesterId) return null;

  const [{ data, error }, allUsersResult, linkedUserIds] = await Promise.all([
    supabase.from("usuarios").select(USER_SELECT).eq("id", requesterId).maybeSingle(),
    supabase.from("usuarios").select(USER_SELECT),
    getSharedSectorLinkedUserIds(sharedProfile),
  ]);

  if (error) throw new Error(error.message);
  if (allUsersResult.error) throw new Error(allUsersResult.error.message);

  const rawRequester = (data as CurrentUserProfile | null) ?? null;
  const requester = rawRequester
    ? applyCpfFallback(rawRequester, (allUsersResult.data ?? []) as CurrentUserProfile[])
    : null;

  if (!canUseRequesterForSharedProfile(sharedProfile, requester, linkedUserIds)) {
    clearSelectedSharedRequesterId();
    return null;
  }

  return requester;
}

export async function getEffectiveCurrentUserProfile(sharedProfile: CurrentUserProfile | null) {
  return getSelectedSharedRequesterProfile(sharedProfile);
}
