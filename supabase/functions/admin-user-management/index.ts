import { createSupabaseContext } from "npm:@supabase/server";

type UserPayload = {
  id?: string | null;
  nome: string;
  usuario?: string;
  email: string;
  cpf?: string | null;
  password?: string | null;
  setor_id: number | null;
  programa_id: string | null;
  materiais_permitidos: string[] | null;
};

type Profile = {
  id: string;
  auth_user_id: string | null;
  nome?: string | null;
  usuario: string | null;
  email: string | null;
  cpf: string | null;
  is_admin: boolean;
  role: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  categorias_permitidas: unknown;
  programa_id: string | null;
  materiais_permitidos: unknown;
};

type AuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

type AuthUserMutation = {
  id: string | null;
  created: boolean;
  updatePayload?: Record<string, unknown>;
};

type AuthLookupClient = {
  rpc: (
    functionName: string,
    args: { target_email: string },
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class UserActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserActionError";
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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

const ALLOWED_REQUEST_MATERIAL_CATEGORIES = new Set([
  "Gêneros alimentícios/limpeza",
  "Frutas, Verduras e Proteínas",
  "Insumos para Dietas Enterais",
  "Ambulatorial",
  "Odontológico",
  "Laboratório",
  "SESB",
  "Expediente",
]);

function normalizeMaterialCategories(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new UserActionError("Selecione tipos de materiais válidos.");
  }

  const categories = value.map(cleanString).filter(Boolean);
  if (categories.some((category) => !ALLOWED_REQUEST_MATERIAL_CATEGORIES.has(category))) {
    throw new UserActionError("Uma ou mais categorias de materiais não são válidas.");
  }

  return [...new Set(categories)];
}

function normalizeCpf(value: unknown) {
  const cpf = cleanString(value);
  if (!cpf) return null;

  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) {
    throw new UserActionError("Informe um CPF com 11 dígitos.");
  }

  return digits;
}

function validateUserPayload(input: unknown): UserPayload {
  if (!input || typeof input !== "object") {
    throw new UserActionError("Dados do usuário inválidos.");
  }

  const data = input as Record<string, unknown>;
  const nome = cleanString(data.nome);
  const rawEmail = cleanString(data.email).toLowerCase();
  const usuario = cleanString(data.usuario) || createLoginFromEmail(rawEmail);
  const email = rawEmail || createInternalEmail(usuario);
  const password = cleanString(data.password) || null;
  const rawSectorId = data.setor_id;
  const setorId =
    rawSectorId === undefined || rawSectorId === null || rawSectorId === ""
      ? null
      : Number(rawSectorId);
  const programaId = cleanString(data.programa_id) || null;
  const materiaisPermitidos = normalizeMaterialCategories(data.materiais_permitidos);

  if (!nome) throw new UserActionError("Informe o nome do usuário.");
  if (!usuario) throw new UserActionError("Informe o usuário de acesso.");
  if (setorId !== null && (!Number.isInteger(setorId) || setorId <= 0)) {
    throw new UserActionError("Selecione um setor válido.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new UserActionError("Informe um email válido.");
  }
  if (password && password.length < 6) {
    throw new UserActionError("A senha deve ter pelo menos 6 caracteres.");
  }

  return {
    id: cleanString(data.id) || null,
    nome,
    usuario,
    email,
    cpf: normalizeCpf(data.cpf),
    password,
    setor_id: setorId,
    programa_id: programaId,
    materiais_permitidos: materiaisPermitidos,
  };
}

function readableSupabaseError(error: unknown, fallback: string) {
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message || fallback;

  if (candidate?.code === "23505" || /duplicate key|already registered/i.test(message)) {
    if (/cpf/i.test(message)) return "Este CPF já está cadastrado para outro usuário.";
    if (/email/i.test(message)) {
      return "Este usuário gera um identificador de login já utilizado. Informe outro usuário.";
    }
    return "Já existe um usuário com esses dados.";
  }

  return message;
}

function isDuplicateCpfError(error: unknown) {
  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    constraint?: string;
  } | null;
  return (
    candidate?.code === "23505" &&
    /cpf/i.test(
      `${candidate.message || ""} ${candidate.details || ""} ${candidate.constraint || ""}`,
    )
  );
}

async function requireAdmin(admin: any, userId: string) {
  const { data: profile, error } = await admin
    .from("usuarios")
    .select("id,is_admin")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new UserActionError(error.message, 500);
  if (!profile?.is_admin) {
    throw new UserActionError("Apenas administradores podem gerenciar usuários.", 403);
  }
}

async function findAuthUserIdByEmail(
  admin: AuthLookupClient,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await admin.rpc("admin_lookup_auth_user_id_by_email", {
    target_email: normalizedEmail,
  });

  if (error) {
    console.error("[admin-user-management] Auth ID lookup failed", { code: error.code });
    throw new UserActionError("Não foi possível localizar o login associado ao usuário.", 500);
  }

  return typeof data === "string" ? data : null;
}

async function ensureAuthUser(
  admin: any,
  payload: UserPayload,
  currentProfile: Profile | null,
): Promise<AuthUserMutation> {
  const existingAuthUserId =
    currentProfile?.auth_user_id ?? (await findAuthUserIdByEmail(admin, payload.email));

  if (existingAuthUserId) {
    const updatePayload: Record<string, unknown> = {
      user_metadata: { nome: payload.nome },
    };

    if (payload.password) updatePayload.password = payload.password;
    return { id: existingAuthUserId, created: false, updatePayload };
  }

  if (!payload.password || payload.password.length < 6) {
    if (currentProfile) return { id: null, created: false };
    throw new UserActionError("Informe uma senha com pelo menos 6 caracteres para criar o login.");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { nome: payload.nome },
  });

  if (error) throw new UserActionError(readableSupabaseError(error, "Erro ao criar o login."), 400);
  if (!data.user?.id) throw new UserActionError("Não foi possível criar o login do usuário.", 500);

  return { id: data.user.id, created: true };
}

async function updateExistingAuthUser(admin: any, authResult: AuthUserMutation) {
  if (!authResult.id || !authResult.updatePayload) return;

  const { error } = await admin.auth.admin.updateUserById(authResult.id, authResult.updatePayload);
  if (error) {
    throw new UserActionError(readableSupabaseError(error, "Erro ao atualizar o login."), 400);
  }
}

function normalizeSectorName(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function syncUserPrimarySector(
  admin: any,
  userId: string,
  sector: { id: number; nome: string },
  currentProfile: Profile | null,
) {
  const { data, error } = await admin
    .from("setor_responsaveis")
    .select("setor_id,setores(nome)")
    .eq("usuario_id", userId);

  if (error) throw new UserActionError(error.message, 500);

  const linkedRows = (data ?? []) as Array<{
    setor_id: number;
    setores: { nome: string | null } | { nome: string | null }[] | null;
  }>;
  const oldPrimaryName = normalizeSectorName(currentProfile?.unidade_nome || currentProfile?.setor);
  const previousPrimaryIds = linkedRows
    .filter((link) => {
      const linkedSector = Array.isArray(link.setores) ? link.setores[0] : link.setores;
      return oldPrimaryName && normalizeSectorName(linkedSector?.nome) === oldPrimaryName;
    })
    .map((link) => link.setor_id)
    .filter((id, index, ids) => ids.indexOf(id) === index && id !== sector.id);
  const targetAlreadyLinked = linkedRows.some((link) => link.setor_id === sector.id);

  if (!targetAlreadyLinked) {
    const { error: insertError } = await admin
      .from("setor_responsaveis")
      .upsert(
        { setor_id: sector.id, usuario_id: userId },
        { onConflict: "setor_id,usuario_id", ignoreDuplicates: true },
      );
    if (insertError) throw new UserActionError(insertError.message, 400);
  }

  if (previousPrimaryIds.length > 0) {
    const { error: deleteError } = await admin
      .from("setor_responsaveis")
      .delete()
      .eq("usuario_id", userId)
      .in("setor_id", previousPrimaryIds);

    if (deleteError) {
      if (!targetAlreadyLinked) {
        await admin
          .from("setor_responsaveis")
          .delete()
          .eq("usuario_id", userId)
          .eq("setor_id", sector.id);
      }
      throw new UserActionError(deleteError.message, 400);
    }
  }
}

async function getAllProfiles(admin: any) {
  const profiles: Array<Pick<Profile, "id" | "usuario" | "email" | "cpf">> = [];
  const pageSize = 1000;

  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const { data, error } = await admin
      .from("usuarios")
      .select("id,usuario,email,cpf")
      .range(from, from + pageSize - 1);

    if (error) throw new UserActionError(error.message, 500);
    profiles.push(...((data ?? []) as typeof profiles));
    if (!data || data.length < pageSize) return profiles;
  }

  throw new UserActionError(
    "Não foi possível validar os usuários: limite de leitura atingido.",
    500,
  );
}

async function updateOwnCpf(admin: any, user: AuthUser, input: unknown) {
  const cpf = normalizeCpf((input as { cpf?: unknown } | null)?.cpf);
  if (!cpf) throw new UserActionError("Informe um CPF com 11 dígitos.");

  const { data: linkedProfile, error: authIdError } = await admin
    .from("usuarios")
    .select("id,auth_user_id,email,usuario,funcao")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (authIdError) throw new UserActionError(authIdError.message, 500);
  let profile = linkedProfile;
  let expectedAuthUserId: string | null = user.id;

  const emailCandidates = [
    ...new Set([user.email?.trim(), user.email?.trim().toLowerCase()]),
  ].filter((email): email is string => Boolean(email));

  for (const email of emailCandidates) {
    if (profile) break;
    const { data: profileByEmail, error: emailError } = await admin
      .from("usuarios")
      .select("id,auth_user_id,email,usuario,funcao")
      .eq("email", email)
      .maybeSingle();

    if (emailError) throw new UserActionError(emailError.message, 500);
    if (profileByEmail) {
      if (profileByEmail.auth_user_id && profileByEmail.auth_user_id !== user.id) {
        throw new UserActionError(
          "Este cadastro está vinculado a outra conta. Fale com o administrador.",
          403,
        );
      }
      if (!profileByEmail.auth_user_id && !user.email_confirmed_at) {
        throw new UserActionError(
          "Confirme o email da sua conta antes de completar o cadastro.",
          403,
        );
      }
      profile = profileByEmail;
      expectedAuthUserId = profileByEmail.auth_user_id ?? null;
    }
  }

  if (!profile) {
    throw new UserActionError(
      "Não foi encontrado um cadastro associado a esta conta. Fale com o administrador.",
      404,
    );
  }

  const normalizeIdentity = (value: unknown) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  if (
    normalizeIdentity(profile.usuario) === "hospital" ||
    normalizeIdentity(profile.funcao) === "login compartilhado"
  ) {
    throw new UserActionError("O CPF não pode ser preenchido em um login compartilhado.", 403);
  }

  const profiles = await getAllProfiles(admin);
  const duplicatedCpf = profiles.find(
    (item) => item.id !== profile.id && item.cpf?.replace(/\D/g, "") === cpf,
  );
  if (duplicatedCpf) {
    throw new UserActionError(
      "Este CPF já está vinculado a outro usuário. Fale com o administrador.",
      409,
    );
  }

  let updateQuery = admin
    .from("usuarios")
    .update({ cpf, auth_user_id: user.id })
    .eq("id", profile.id);
  updateQuery = expectedAuthUserId
    ? updateQuery.eq("auth_user_id", expectedAuthUserId)
    : updateQuery.is("auth_user_id", null);

  const { data: updated, error: updateError } = await updateQuery.select("id,cpf").maybeSingle();

  if (updateError) {
    const duplicateCpf = isDuplicateCpfError(updateError);
    throw new UserActionError(
      duplicateCpf
        ? "Este CPF já está vinculado a outro usuário. Fale com o administrador."
        : readableSupabaseError(updateError, "Não foi possível salvar o CPF."),
      duplicateCpf ? 409 : 400,
    );
  }
  if (!updated) {
    throw new UserActionError(
      "O vínculo do cadastro mudou. Entre novamente e tente salvar o CPF.",
      409,
    );
  }

  return { cpf: updated.cpf };
}

async function rollbackUserProfile(
  admin: any,
  savedProfileId: string,
  currentProfile: Profile | null,
) {
  if (!currentProfile) {
    const { error } = await admin.from("usuarios").delete().eq("id", savedProfileId);
    return error;
  }

  const { error } = await admin
    .from("usuarios")
    .update({
      auth_user_id: currentProfile.auth_user_id,
      nome: currentProfile.nome,
      usuario: currentProfile.usuario,
      email: currentProfile.email,
      cpf: currentProfile.cpf,
      funcao: currentProfile.funcao,
      setor: currentProfile.setor,
      unidade_nome: currentProfile.unidade_nome,
      categorias_permitidas: currentProfile.categorias_permitidas,
      programa_id: currentProfile.programa_id,
      materiais_permitidos: currentProfile.materiais_permitidos,
      is_admin: currentProfile.is_admin,
      role: currentProfile.role,
    })
    .eq("id", savedProfileId);
  return error;
}

async function saveUser(admin: any, input: unknown) {
  const payload = validateUserPayload(input);
  let currentProfile: Profile | null = null;

  if (payload.id) {
    const { data: profile, error } = await admin
      .from("usuarios")
      .select(
        "auth_user_id,email,is_admin,role,funcao,setor,unidade_nome,categorias_permitidas,programa_id,materiais_permitidos,cpf,id,usuario,nome",
      )
      .eq("id", payload.id)
      .maybeSingle();

    if (error) throw new UserActionError(error.message, 500);
    if (!profile) throw new UserActionError("Usuário não encontrado.", 404);
    currentProfile = profile as Profile;
  }

  let selectedSector: { id: number; nome: string; programa: string | null } | null = null;
  if (payload.setor_id !== null) {
    const { data: sector, error } = await admin
      .from("setores")
      .select("id,nome,programa")
      .eq("id", payload.setor_id)
      .maybeSingle();

    if (error) throw new UserActionError(error.message, 500);
    if (!sector) throw new UserActionError("O setor selecionado não existe.");
    selectedSector = sector as { id: number; nome: string; programa: string | null };
  } else if (currentProfile && !currentProfile.is_admin) {
    const currentLocation = normalizeSectorName(
      currentProfile.unidade_nome || currentProfile.setor,
    );
    const { data: sectors, error } = await admin.from("setores").select("id,nome,programa");

    if (error) throw new UserActionError(error.message, 500);
    selectedSector =
      ((sectors ?? []) as Array<{ id: number; nome: string; programa: string | null }>).find(
        (sector) => normalizeSectorName(sector.nome) === currentLocation,
      ) ?? null;
  }

  const programaId = payload.programa_id || currentProfile?.programa_id || null;
  if (programaId) {
    const { data: program, error } = await admin
      .from("programas")
      .select("id")
      .eq("id", programaId)
      .maybeSingle();

    if (error) throw new UserActionError(error.message, 500);
    if (!program) throw new UserActionError("O programa selecionado não existe.");
  }

  const legacyMaterials = Array.isArray(currentProfile?.categorias_permitidas)
    ? currentProfile.categorias_permitidas
        .map(cleanString)
        .filter((category) => ALLOWED_REQUEST_MATERIAL_CATEGORIES.has(category))
    : [];
  const materiaisPermitidos =
    payload.materiais_permitidos ??
    (Array.isArray(currentProfile?.materiais_permitidos)
      ? currentProfile.materiais_permitidos
          .map(cleanString)
          .filter((category) => ALLOWED_REQUEST_MATERIAL_CATEGORIES.has(category))
      : legacyMaterials);

  if (!currentProfile?.is_admin) {
    if (!selectedSector) throw new UserActionError("Selecione o setor do usuário.");
    if (!programaId) throw new UserActionError("Selecione o programa do usuário.");
    if (materiaisPermitidos.length === 0) {
      throw new UserActionError("Selecione ao menos um tipo de material permitido.");
    }
  }

  if (payload.usuario.toLowerCase() === "admin" && !currentProfile?.is_admin) {
    throw new UserActionError("O login admin é reservado para o administrador.");
  }

  const profiles = await getAllProfiles(admin);
  const otherProfiles = profiles.filter((profile) => profile.id !== payload.id);
  const duplicatedUser = otherProfiles.find(
    (profile) => profile.usuario?.trim().toLowerCase() === payload.usuario.toLowerCase(),
  );

  if (duplicatedUser) {
    throw new UserActionError(
      "Já existe um usuário com este login. Informe outro usuário de acesso.",
    );
  }

  const compactLoginKey = createCompactLoginKey(payload.usuario);
  const ambiguousCompactLogin = otherProfiles.find(
    (profile) => createCompactLoginKey(profile.usuario || "") === compactLoginKey,
  );

  if (ambiguousCompactLogin) {
    throw new UserActionError(
      `Já existe um usuário com login equivalente (${ambiguousCompactLogin.usuario}). Use outro usuário sem variar apenas espaços.`,
    );
  }

  const authEmail = currentProfile?.email?.trim().toLowerCase() || payload.email;
  const duplicatedEmail = otherProfiles.find(
    (profile) => profile.email?.trim().toLowerCase() === authEmail,
  );
  if (duplicatedEmail) {
    throw new UserActionError(
      `Este usuário gera um identificador de login já utilizado por ${duplicatedEmail.usuario || "outro usuário"}. Informe outro usuário de acesso.`,
    );
  }

  if (payload.cpf) {
    const duplicatedCpf = otherProfiles.find(
      (profile) => profile.cpf?.replace(/\D/g, "") === payload.cpf,
    );
    if (duplicatedCpf) throw new UserActionError("Este CPF já está cadastrado para outro usuário.");
  }

  // Email is an internal Supabase Auth identifier; admins enter only the username.
  const authPayload = {
    ...payload,
    email: authEmail,
  };
  const authResult = await ensureAuthUser(admin, authPayload, currentProfile);

  const profilePayload = {
    auth_user_id: authResult.id,
    nome: payload.nome,
    usuario: payload.usuario,
    email: authPayload.email,
    cpf: payload.cpf,
    funcao: currentProfile?.funcao ?? null,
    setor: selectedSector?.programa || selectedSector?.nome || currentProfile?.setor || null,
    unidade_nome: selectedSector?.nome || currentProfile?.unidade_nome || null,
    categorias_permitidas: currentProfile?.categorias_permitidas ?? [],
    programa_id: programaId,
    materiais_permitidos: materiaisPermitidos,
    is_admin: currentProfile?.is_admin ?? false,
    role: currentProfile?.role || "usuario",
  };

  try {
    const result = payload.id
      ? await admin
          .from("usuarios")
          .update(profilePayload)
          .eq("id", payload.id)
          .select("id")
          .single()
      : await admin.from("usuarios").insert(profilePayload).select("id").single();

    if (result.error) {
      const duplicateCpf = isDuplicateCpfError(result.error);
      throw new UserActionError(
        duplicateCpf
          ? "Este CPF já está cadastrado para outro usuário."
          : readableSupabaseError(result.error, "Não foi possível salvar o usuário."),
        duplicateCpf ? 409 : 400,
      );
    }

    try {
      await updateExistingAuthUser(admin, authResult);
      if (selectedSector) {
        await syncUserPrimarySector(admin, result.data.id, selectedSector, currentProfile);
      }
    } catch (authError) {
      const rollbackError = await rollbackUserProfile(admin, result.data.id, currentProfile);
      if (rollbackError) {
        console.error("[admin-user-management] profile rollback failed after Auth update error.");
        throw new UserActionError(
          "Não foi possível atualizar o login nem reverter os dados do usuário. Contate o administrador.",
          500,
        );
      }
      throw authError;
    }

    return { id: result.data.id };
  } catch (error) {
    if (authResult.created && authResult.id) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(authResult.id);
      if (rollbackError) console.error("[admin-user-management] Auth rollback failed.");
    }
    throw error;
  }
}

async function deleteUser(admin: any, input: unknown) {
  const id = cleanString((input as { id?: string } | null)?.id);
  if (!id) throw new UserActionError("Usuário não informado.");

  const { data: profile, error } = await admin
    .from("usuarios")
    .select("id,email,auth_user_id,is_admin")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new UserActionError(error.message, 500);
  if (!profile) throw new UserActionError("Usuário não encontrado.", 404);
  if (profile.is_admin) {
    throw new UserActionError("Não é possível excluir um administrador por aqui.", 400);
  }

  const authUserId =
    profile.auth_user_id || (await findAuthUserIdByEmail(admin, profile.email || "")) || null;

  if (authUserId) {
    const { error: authError } = await admin.auth.admin.deleteUser(authUserId);
    if (authError && !/not found/i.test(authError.message || "")) {
      throw new UserActionError(authError.message, 400);
    }
  }

  const { error: deleteError } = await admin.from("usuarios").delete().eq("id", id);
  if (deleteError) throw new UserActionError(deleteError.message, 400);

  return { ok: true };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const { data: context, error: contextError } = await createSupabaseContext(request, {
      auth: "user",
    });

    if (contextError || !context) {
      const status = (contextError as { status?: number } | null)?.status ?? 401;
      throw new UserActionError("Sessão inválida ou expirada. Entre novamente.", status);
    }

    const admin = context.supabaseAdmin as any;
    const { data: authData, error: authError } = await context.supabase.auth.getUser();
    const authUser = authData?.user as AuthUser | null;
    if (authError || !authUser?.id) {
      throw new UserActionError("Sessão inválida. Entre novamente.", 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new UserActionError("Requisição inválida.");

    const action = (body as { action?: unknown }).action;
    if (action === "update_my_cpf") {
      return jsonResponse(await updateOwnCpf(admin, authUser, body));
    }

    await requireAdmin(admin, authUser.id);
    if (action === "save") {
      return jsonResponse(await saveUser(admin, body));
    }
    if (action === "delete") {
      return jsonResponse(await deleteUser(admin, body));
    }

    throw new UserActionError("Ação não reconhecida.");
  } catch (error) {
    const status = error instanceof UserActionError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro ao processar usuário.";
    console.error("[admin-user-management] request failed", { status });
    return jsonResponse({ error: message }, status);
  }
});
