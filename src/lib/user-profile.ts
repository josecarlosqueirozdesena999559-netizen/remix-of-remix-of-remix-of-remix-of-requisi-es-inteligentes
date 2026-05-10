import { supabase } from "@/integrations/supabase/client";

export interface CurrentUserProfile {
  id: string;
  auth_user_id: string | null;
  nome: string;
  email: string;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  whatsapp: string | null;
  is_admin: boolean;
  categorias_permitidas: unknown;
}

export function isUserProfileIncomplete(profile: CurrentUserProfile | null) {
  if (profile?.is_admin) return false;

  return !profile?.funcao?.trim();
}

export async function getCurrentUserProfile() {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(authError.message);
  }

  const user = authData.user;

  if (!user) {
    return { user: null, profile: null };
  }

  const select =
    "id,auth_user_id,nome,email,cpf,funcao,setor,unidade_nome,whatsapp,is_admin,categorias_permitidas";
  const { data: byAuthId, error: authIdError } = await supabase
    .from("usuarios")
    .select(select)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (authIdError) {
    throw new Error(authIdError.message);
  }

  if (byAuthId) {
    return { user, profile: byAuthId as CurrentUserProfile };
  }

  if (!user.email) {
    return { user, profile: null };
  }

  const { data: byEmail, error: emailError } = await supabase
    .from("usuarios")
    .select(select)
    .eq("email", user.email)
    .maybeSingle();

  if (emailError) {
    throw new Error(emailError.message);
  }

  return { user, profile: (byEmail as CurrentUserProfile | null) ?? null };
}
