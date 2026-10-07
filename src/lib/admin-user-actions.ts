import { supabase } from "@/integrations/supabase/client";

type AdminUserPayload = {
  id?: string | null;
  nome: string;
  usuario: string;
  cpf?: string | null;
  password?: string | null;
  setor_id?: number | null;
  programa_id?: string | null;
  materiais_permitidos?: string[];
};

type UserActionResponse = {
  id?: string;
  ok?: boolean;
  error?: string;
};

async function invokeAdminUserManagement(body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

  const { data, error } = await supabase.functions.invoke<UserActionResponse>(
    "admin-user-management",
    {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (error) {
    const context = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && context instanceof Response) {
      const payload = (await context
        .clone()
        .json()
        .catch(() => null)) as UserActionResponse | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || "Não foi possível comunicar com o Supabase.");
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

export async function saveMyCpf({ data }: { data: { cpf: string } }) {
  return invokeAdminUserManagement({ action: "update_my_cpf", cpf: data.cpf });
}

export async function saveAdminUser({ data }: { data: AdminUserPayload }) {
  return invokeAdminUserManagement({ action: "save", ...data });
}

export async function deleteAdminUser({ data }: { data: { id: string } }) {
  return invokeAdminUserManagement({ action: "delete", id: data.id });
}
