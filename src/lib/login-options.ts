import { supabase } from "@/integrations/supabase/client";

export type LoginOption = {
  login: string;
  displayName: string;
  requesterId: string | null;
  isShared: boolean;
};

export async function searchLoginOptions(query: string): Promise<LoginOption[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];

  const { data, error } = await supabase.rpc("search_login_options", {
    p_query: normalizedQuery,
  });

  if (error) throw new Error(error.message || "Não foi possível buscar os acessos.");

  return (data ?? [])
    .map((row) => ({
      login: row.login_usuario.trim(),
      displayName: row.display_name.trim(),
      requesterId: row.requester_id,
      isShared: row.is_shared,
    }))
    .filter((option) => option.login && option.displayName);
}

export async function resolveLoginEmail(login: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("resolve_login_email", {
    p_usuario: login,
  });

  if (error) throw new Error(error.message || "Não foi possível validar o usuário.");
  return typeof data === "string" && data.trim() ? data : null;
}
