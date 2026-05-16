import { createServerFn } from "@tanstack/react-start";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

function cleanLogin(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function findUniqueEmailByColumn(column: "usuario" | "email" | "cpf", value: string) {
  const query = (supabaseAdmin as any).from("usuarios").select("email").limit(2);
  const { data, error } =
    column === "cpf" ? await query.eq(column, value) : await query.ilike(column, value);

  if (error) throw new Error(error.message);
  if (!data?.length || data.length > 1) return null;

  return cleanLogin(data[0]?.email).toLowerCase() || null;
}

export const resolveLoginEmail = createServerFn({ method: "POST" }).handler(async ({ data }) => {
  const login = cleanLogin((data as { login?: string } | undefined)?.login);
  if (!login) return { email: null };

  if (login.includes("@")) {
    return { email: login.toLowerCase() };
  }

  const emailByUser = await findUniqueEmailByColumn("usuario", login);
  if (emailByUser) return { email: emailByUser };

  const digits = login.replace(/\D/g, "");
  if (digits) {
    const emailByCpf = await findUniqueEmailByColumn("cpf", digits);
    if (emailByCpf) return { email: emailByCpf };
  }

  return { email: null };
});
