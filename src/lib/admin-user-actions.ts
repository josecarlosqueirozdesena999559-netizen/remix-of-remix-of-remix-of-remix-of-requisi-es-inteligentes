import { createServerFn } from "@tanstack/react-start";

import { ADMIN_SECTIONS } from "@/lib/admin-sections";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeProductCategory } from "@/lib/product-options";

type AdminUserPayload = {
  id?: string | null;
  nome: string;
  usuario?: string;
  email: string;
  cpf?: string | null;
  funcao?: string | null;
  setor?: string | null;
  unidade_nome?: string | null;
  categorias_permitidas?: string[];
  password?: string | null;
};

type ServerFnAuthPayload = {
  accessToken?: string | null;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isAdminSection(value: string) {
  return (ADMIN_SECTIONS as readonly string[]).includes(value);
}

function getAccessToken(input: unknown) {
  if (!input || typeof input !== "object") return "";
  return cleanString((input as ServerFnAuthPayload).accessToken);
}

function normalizeInternalLoginSlug(usuario: string) {
  return usuario
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function createCompactLoginKey(usuario: string) {
  return usuario.toLowerCase().replace(/\s+/g, "");
}

function createInternalEmail(usuario: string) {
  const slug = normalizeInternalLoginSlug(usuario);

  return `${slug || "usuario"}@usuarios.solicite.local`;
}

function createLoginFromEmail(email: string) {
  return email.split("@")[0]?.trim() || email.trim();
}

function validateUserPayload(input: unknown): AdminUserPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Dados do usuario invalidos.");
  }

  const data = input as Partial<AdminUserPayload>;
  const nome = cleanString(data.nome);
  const rawEmail = cleanString(data.email).toLowerCase();
  const usuario = cleanString(data.usuario) || createLoginFromEmail(rawEmail);
  const email = rawEmail || createInternalEmail(usuario);

  if (!nome) throw new Error("Informe o nome do usuario.");
  if (!email) throw new Error("Informe o email do usuario.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um email valido.");
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

  throw new Error("Apenas administradores podem gerenciar usuarios.");
}

async function requireAdminFromAccessToken(input: unknown) {
  const accessToken = getAccessToken(input);
  if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

  const { data, error } = await (supabaseAdmin as any).auth.getUser(accessToken);
  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user?.id) throw new Error("Sessao expirada. Entre novamente.");

  await requireAdmin(user.id, user.email);
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
  if (!data.user?.id) throw new Error("Nao foi possivel criar o login do usuario.");

  return data.user.id;
}

export const saveAdminUser = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    const payload = validateUserPayload(data);
    let currentProfile: {
      auth_user_id: string | null;
      email: string | null;
      is_admin: boolean;
      role: string | null;
      categorias_permitidas: unknown;
    } | null = null;

    if (payload.id) {
      const { data: profile, error } = await (supabaseAdmin as any)
        .from("usuarios")
        .select("auth_user_id,email,is_admin,role,categorias_permitidas")
        .eq("id", payload.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!profile) throw new Error("Usuario nao encontrado.");
      currentProfile = profile;
    }

    if (payload.usuario.toLowerCase() === "admin" && !currentProfile?.is_admin) {
      throw new Error("O login admin e reservado para o administrador.");
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
      throw new Error("Ja existe um usuario com este login. Informe outro usuario de acesso.");
    }

    const compactLoginKey = createCompactLoginKey(payload.usuario);
    const { data: compactMatches, error: compactMatchesError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,usuario")
      .limit(200);

    if (compactMatchesError) throw new Error(compactMatchesError.message);

    const ambiguousCompactLogin = (compactMatches ?? []).find(
      (profile: { id: string; usuario: string | null }) =>
        profile.id !== payload.id &&
        createCompactLoginKey(profile.usuario || "") === compactLoginKey,
    );

    if (ambiguousCompactLogin) {
      throw new Error(
        `Ja existe um usuario com login equivalente (${ambiguousCompactLogin.usuario}). Use outro usuario sem variar apenas espacos.`,
      );
    }

    const { data: sameEmailProfiles, error: sameEmailError } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,usuario,email")
      .ilike("email", payload.email)
      .limit(2);

    if (sameEmailError) throw new Error(sameEmailError.message);

    const duplicatedInternalEmail = (sameEmailProfiles ?? []).find(
      (profile: { id: string; usuario: string | null; email: string | null }) =>
        profile.id !== payload.id,
    );

    if (duplicatedInternalEmail) {
      throw new Error(
        `O usuario de acesso informado gera o mesmo login interno de ${duplicatedInternalEmail.usuario}. Escolha outro usuario de acesso.`,
      );
    }

    // Preserve the existing auth email for edits. The app authenticates by
    // `usuario` via `resolve_login_email`, so changing profile fields should
    // not force an auth email rotation.
    const authPayload = {
      ...payload,
      email: currentProfile?.email || payload.email,
    };

    const authUserId = await ensureAuthUser(authPayload, currentProfile?.auth_user_id);

    const preservedAdminSections =
      currentProfile?.is_admin && Array.isArray(currentProfile.categorias_permitidas)
        ? currentProfile.categorias_permitidas
            .map(String)
            .map((value) => value.trim())
            .filter(isAdminSection)
        : [];

    const profilePayload = {
      auth_user_id: authUserId,
      nome: payload.nome,
      usuario: payload.usuario,
      email: authPayload.email,
      cpf: payload.cpf,
      funcao: payload.funcao,
      setor: payload.setor,
      unidade_nome: payload.unidade_nome,
      categorias_permitidas: currentProfile?.is_admin
        ? [...preservedAdminSections, ...(payload.categorias_permitidas ?? [])]
        : payload.categorias_permitidas,
      is_admin: currentProfile?.is_admin ?? false,
      role: currentProfile?.role || "usuario",
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

export const deleteAdminUser = createServerFn({ method: "POST" }).handler(async ({ data }) => {
    await requireAdminFromAccessToken(data);

    const id = cleanString((data as { id?: string } | undefined)?.id);
    if (!id) throw new Error("Usuario nao informado.");

    const { data: profile, error } = await (supabaseAdmin as any)
      .from("usuarios")
      .select("id,email,auth_user_id,is_admin")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Usuario nao encontrado.");
    if (profile.is_admin) throw new Error("Nao e possivel excluir um administrador por aqui.");

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
