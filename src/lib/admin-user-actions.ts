import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeProductCategory } from "@/lib/product-options";

type AdminUserPayload = {
  id?: string | null;
  nome: string;
  usuario: string;
  email?: string | null;
  cpf?: string | null;
  funcao?: string | null;
  setor?: string | null;
  unidade_nome?: string | null;
  categorias_permitidas?: string[];
  password?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createInternalEmail(usuario: string) {
  const slug = usuario
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return `${slug || "usuario"}@usuarios.solicite.local`;
}

function validateUserPayload(input: unknown): AdminUserPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Dados do usuário inválidos.");
  }

  const data = input as Partial<AdminUserPayload>;
  const nome = cleanString(data.nome);
  const usuario = cleanString(data.usuario);
  const email = cleanString(data.email).toLowerCase() || createInternalEmail(usuario);

  if (!nome) throw new Error("Informe o nome do usuario.");
  if (!usuario) throw new Error("Informe o usuario de acesso.");

  const categorias = Array.isArray(data.categorias_permitidas)
    ? data.categorias_permitidas
        .map(String)
        .map(normalizeProductCategory)
        .filter((categoria, index, categoriasNormalizadas) => {
          return Boolean(categoria) && categoriasNormalizadas.indexOf(categoria) === index;
        })
    : [];

  return {
    id: cleanString(data.id) || null,
    nome,
    usuario,
    email,
    cpf: cleanString(data.cpf) || null,
    funcao: cleanString(data.funcao) || null,
    setor: cleanString(data.setor) || null,
    unidade_nome: cleanString(data.unidade_nome) || null,
    categorias_permitidas: categorias,
    password: cleanString(data.password) || null,
  };
}

async function requireAdmin(userId: string, email?: string | null) {
  const { data: profile, error } = await (supabaseAdmin as any)
    .from("usuarios")
    .select("id,is_admin")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (profile?.is_admin) return;

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    const { data: profileByEmail, error: emailError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,is_admin")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (emailError) throw new Error(emailError.message);
    if (profileByEmail?.is_admin) return;
  }

  throw new Error("Apenas administradores podem gerenciar usuários.");
}

async function findAuthUserByEmail(email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await (supabaseAdmin as any).auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error(error.message);

    const user = data?.users?.find(
      (item: { email?: string | null }) => item.email?.toLowerCase() === email.toLowerCase(),
    );

    if (user) return user;
    if (!data?.users || data.users.length < 1000) return null;
  }

  return null;
}

async function ensureAuthUser(payload: AdminUserPayload, currentAuthUserId?: string | null) {
  const authUserId = currentAuthUserId?.trim();
  const email = payload.email || createInternalEmail(payload.usuario);
  const existingAuthUser = authUserId
    ? { id: authUserId }
    : await findAuthUserByEmail(email);

  if (existingAuthUser?.id) {
    const updatePayload: Record<string, unknown> = {
      email,
      email_confirm: true,
      user_metadata: { nome: payload.nome },
    };

    if (payload.password) updatePayload.password = payload.password;

    const { data, error } = await (supabaseAdmin as any).auth.admin.updateUserById(
      existingAuthUser.id,
      updatePayload,
    );

    if (error) throw new Error(error.message);
    return data.user?.id || existingAuthUser.id;
  }

  if (!payload.password || payload.password.length < 6) {
    throw new Error("Informe uma senha com pelo menos 6 caracteres para criar o login.");
  }

  const { data, error } = await (supabaseAdmin as any).auth.admin.createUser({
    email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { nome: payload.nome },
  });

  if (error) throw new Error(error.message);
  if (!data.user?.id) throw new Error("Não foi possível criar o login do usuário.");

  return data.user.id;
}

export const saveAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId, (context as any).claims?.email);

    const payload = validateUserPayload(data);
    let currentProfile: {
      auth_user_id: string | null;
      is_admin: boolean;
      role: string | null;
    } | null = null;

    if (payload.id) {
      const { data: profile, error } = await (supabaseAdmin as any)
        .from("usuarios")
        .select("auth_user_id,is_admin,role")
        .eq("id", payload.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!profile) throw new Error("Usuário não encontrado.");
      currentProfile = profile;
    }

    if (payload.usuario.toLowerCase() === "admin" && !currentProfile?.is_admin) {
      throw new Error("O login admin é reservado para o administrador.");
    }

    const { data: sameUserProfiles, error: sameUserError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id")
      .ilike("usuario", payload.usuario)
      .limit(2);

    if (sameUserError) throw new Error(sameUserError.message);

    const duplicatedUser = (sameUserProfiles ?? []).some(
      (profile: { id: string }) => profile.id !== payload.id,
    );

    if (duplicatedUser) {
      throw new Error("Já existe um usuário com este login. Informe outro usuário de acesso.");
    }

    const authUserId = await ensureAuthUser(payload, currentProfile?.auth_user_id);

    const profilePayload = {
      auth_user_id: authUserId,
      nome: payload.nome,
      usuario: payload.usuario,
      email: payload.email,
      cpf: payload.cpf,
      funcao: payload.funcao,
      setor: payload.setor,
      unidade_nome: payload.unidade_nome,
      categorias_permitidas: payload.categorias_permitidas,
      is_admin: currentProfile?.is_admin ?? false,
      role: currentProfile?.role || "user",
    };

    const result = payload.id
      ? await (supabaseAdmin as any)
          .from("usuarios")
          .update(profilePayload)
          .eq("id", payload.id)
          .select("id")
          .single()
      : await (supabaseAdmin as any).from("usuarios").insert(profilePayload).select("id").single();

    if (result.error) throw new Error(result.error.message);

    return { id: result.data.id };
  });

export const deleteAdminUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin((context as any).userId, (context as any).claims?.email);

    const id = cleanString((data as { id?: string } | undefined)?.id);
    if (!id) throw new Error("Usuário não informado.");

    const { data: profile, error } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,email,auth_user_id,is_admin")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Usuário não encontrado.");
    if (profile.is_admin) throw new Error("Não é possível excluir um administrador por aqui.");

    const authUserId =
      profile.auth_user_id || (await findAuthUserByEmail(profile.email))?.id || null;

    if (authUserId) {
      const { error: authError } = await (supabaseAdmin as any).auth.admin.deleteUser(authUserId);
      if (authError && !/not found/i.test(authError.message || "")) {
        throw new Error(authError.message);
      }
    }

    const { error: deleteError } = await (supabaseAdmin as any)
      .from("usuarios")
      .delete()
      .eq("id", id);

    if (deleteError) throw new Error(deleteError.message);

    return { ok: true };
  });
