import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function cleanLoginName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const resolveLoginEmail = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const loginName = cleanLoginName((data as { nome?: string } | undefined)?.nome);

  if (!loginName) {
    throw new Error("Informe o nome do usuário.");
  }

  if (loginName.toLowerCase() === "admin") {
    const { data: adminUser, error } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("email")
      .eq("is_admin", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!adminUser?.email) throw new Error("Usuário ou senha inválido");

    return { email: adminUser.email as string };
  }

  const { data: users, error } = await (supabaseAdmin as any)
    .from("usuarios")
    .select("email")
    .ilike("nome", loginName)
    .limit(2);

  if (error) throw new Error(error.message);

  if (!users?.length) {
    throw new Error("Usuário ou senha inválido");
  }

  if (users.length > 1) {
    throw new Error("Existe mais de um usuário com este nome. Peça ao admin para ajustar o cadastro.");
  }

  return { email: users[0].email as string };
});
