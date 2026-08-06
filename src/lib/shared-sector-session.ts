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
) {
  if (!sharedProfile || !requester) return false;
  if (isSharedSectorProfile(requester)) return false;

  const sharedLocation = getProfileLocation(sharedProfile);
  if (!sharedLocation) return false;

  return (
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

  const { data, error } = await supabase.from("usuarios").select(USER_SELECT).order("nome", {
    ascending: true,
  });

  if (error) throw new Error(error.message);

  const allUsers = (data ?? []) as CurrentUserProfile[];
  const seen = new Set<string>();

  return allUsers
    .filter((user) => canUseRequesterForSharedProfile(sharedProfile, user))
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

  const [{ data, error }, allUsersResult] = await Promise.all([
    supabase.from("usuarios").select(USER_SELECT).eq("id", requesterId).maybeSingle(),
    supabase.from("usuarios").select(USER_SELECT),
  ]);

  if (error) throw new Error(error.message);
  if (allUsersResult.error) throw new Error(allUsersResult.error.message);

  const rawRequester = (data as CurrentUserProfile | null) ?? null;
  const requester = rawRequester
    ? applyCpfFallback(rawRequester, (allUsersResult.data ?? []) as CurrentUserProfile[])
    : null;

  if (!canUseRequesterForSharedProfile(sharedProfile, requester)) {
    clearSelectedSharedRequesterId();
    return null;
  }

  return requester;
}

export async function getEffectiveCurrentUserProfile(sharedProfile: CurrentUserProfile | null) {
  return getSelectedSharedRequesterProfile(sharedProfile);
}

