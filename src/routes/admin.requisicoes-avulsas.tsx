import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  isPdfFile,
  uploadAvulsaPdfs,
  type AvulsaSignatureRow,
  type AvulsaUserOption,
} from "@/lib/avulsa-signatures";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/requisicoes-avulsas")({
  component: RequisicoesAvulsasPage,
});

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanEmailUser(email: string | null | undefined) {
  const local = email?.split("@")[0]?.trim() || "";
  return local && !local.startsWith("login-desativado-") ? local : "";
}

function getUserLocation(user: AvulsaUserOption) {
  return user.local_nome?.trim() || user.unidade_nome?.trim() || user.setor?.trim() || "Sem local";
}

function isLocationLikeName(value: string | null | undefined) {
  const name = normalizeText(value);
  return /^(ubs|sesb|samu|hospital|secretaria|odontologico|odonto|vigilancia sanitaria)(\b| -)/.test(
    name,
  );
}

function getUserRecipientName(user: AvulsaUserOption) {
  const displayName = user.display_nome?.trim();
  if (displayName) return displayName;
  const name = user.nome?.trim() || "";
  const location = getUserLocation(user);
  const normalizedName = normalizeText(name);
  const normalizedLocation = normalizeText(location);
  const login = user.usuario?.trim() || cleanEmailUser(user.email);

  if (!name) return login || "Usuário sem nome";
  if (login && (normalizedName === normalizedLocation || isLocationLikeName(name))) return login;
  return name;
}

function getUserListLabel(user: AvulsaUserOption) {
  return `${getUserRecipientName(user)} - ${getUserLocation(user)}`;
}

function getSingleUser(value: AvulsaUserOption | AvulsaUserOption[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isSharedLogin(user: AvulsaUserOption) {
  const login = normalizeText(user.usuario);
  const role = normalizeText(user.funcao);
  return role === "login compartilhado" || login === "hospital";
}

function hasSectorResponsibleName(value: string | null | undefined) {
  const name = String(value || "").trim();
  return Boolean(name && !isLocationLikeName(name));
}

function isGenericSectorOption(user: AvulsaUserOption) {
  const name = normalizeText(user.nome);
  const location = normalizeText(getUserLocation(user));

  return (
    !user.cpf?.trim() &&
    (Boolean(name && location && name === location) || isLocationLikeName(user.nome))
  );
}

function makeUserOption(
  user: AvulsaUserOption,
  local?: string | null,
  displayName?: string | null,
  displayCpf?: string | null,
) {
  const location = local?.trim() || getUserLocation(user);
  return {
    ...user,
    local_nome: location,
    display_nome: hasSectorResponsibleName(displayName) ? displayName?.trim() : undefined,
    display_cpf: displayCpf?.trim() || user.cpf,
    option_key: `${user.id}:${normalizeText(location)}:${normalizeText(displayName)}`,
  };
}

function RequisicoesAvulsasPage() {
  const [users, setUsers] = useState<AvulsaUserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [titulo, setTitulo] = useState("");
  const [saidaCodigo, setSaidaCodigo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [{ profile }, usersResult, sectorsResult] = await Promise.all([
        getCurrentUserProfile(),
        supabase
          .from("usuarios")
          .select("id,nome,usuario,email,cpf,funcao,setor,unidade_nome")
          .or("is_admin.eq.false,is_admin.is.null")
          .order("nome", { ascending: true }),
        supabase
          .from("setores")
          .select(
            "id,nome,responsavel,responsavel_cpf,setor_responsaveis(usuarios(id,nome,usuario,email,cpf,funcao,setor,unidade_nome))",
          )
          .order("nome", { ascending: true }),
      ]);

      if (!profile?.is_admin) {
        setError("Apenas administradores podem enviar requisições avulsas.");
        return;
      }

      if (usersResult.error || sectorsResult.error) {
        throw new Error(
          usersResult.error?.message ||
            sectorsResult.error?.message ||
            "Erro ao carregar usuários.",
        );
      }

      const linkedOptions = (
        (sectorsResult.data ?? []) as {
          nome: string | null;
          responsavel?: string | null;
          responsavel_cpf?: string | null;
          setor_responsaveis?: { usuarios: AvulsaUserOption | AvulsaUserOption[] | null }[];
        }[]
      ).flatMap((sector) =>
        (sector.setor_responsaveis ?? [])
          .map((row) => getSingleUser(row.usuarios))
          .filter((user): user is AvulsaUserOption => Boolean(user))
          .map((user) =>
            makeUserOption(
              user,
              sector.nome,
              isGenericSectorOption(user) || isSharedLogin(user) ? sector.responsavel : user.nome,
              sector.responsavel_cpf || user.cpf,
            ),
          )
          .filter(
            (user) => hasSectorResponsibleName(user.display_nome) || !isGenericSectorOption(user),
          ),
      );
      const directOptions = ((usersResult.data ?? []) as AvulsaUserOption[])
        .filter((user) => !isSharedLogin(user) && !isGenericSectorOption(user))
        .map((user) => makeUserOption(user));
      const seen = new Set<string>();
      const options = [...linkedOptions, ...directOptions]
        .filter((user) => {
          const key = user.option_key || user.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) =>
          getUserListLabel(a).localeCompare(getUserListLabel(b), "pt-BR", { sensitivity: "base" }),
        );

      setUsers(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedUser =
    users.find((user) => (user.option_key || user.id) === selectedUserId) || null;
  const filteredUsers = useMemo(() => {
    const query = normalizeText(userSearch);
    if (!query) return users;

    return users.filter((user) =>
      [getUserListLabel(user), user.nome, user.usuario, user.email, user.setor, user.unidade_nome]
        .filter(Boolean)
        .some((value) => normalizeText(String(value)).includes(query)),
    );
  }, [userSearch, users]);

  const resetForm = () => {
    setSelectedUserId("");
    setUserSearch("");
    setTitulo("");
    setSaidaCodigo("");
    setObservacao("");
    setFiles([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!selectedUser) {
      setError("Selecione o usuário que precisa assinar.");
      return;
    }

    if (!titulo.trim()) {
      setError("Informe o título do documento.");
      return;
    }

    if (!saidaCodigo.trim()) {
      setError("Informe o número do SIG.");
      return;
    }

    if (files.length === 0) {
      setError("Anexe pelo menos um PDF.");
      return;
    }

    if (files.some((selectedFile) => !isPdfFile(selectedFile))) {
      setError("Anexe apenas arquivos PDF.");
      return;
    }

    const id = crypto.randomUUID();
    setSaving(true);

    try {
      const attachments = await uploadAvulsaPdfs({ files, assinaturaId: id, signed: false });
      const { data: authData } = await supabase.auth.getUser();
      const { data, error: insertError } = await supabase
        .from("assinaturas_avulsas" as any)
        .insert({
          id,
          usuario_id: selectedUser.id,
          solicitante: getUserRecipientName(selectedUser),
          solicitante_cpf: selectedUser.display_cpf || selectedUser.cpf,
          setor: getUserLocation(selectedUser),
          titulo: titulo.trim(),
          saida_codigo: saidaCodigo.trim(),
          observacao: observacao.trim() || null,
          status: "aguardando_assinatura",
          admin_attachment: attachments,
          created_by: authData.user?.id || null,
        })
        .select("*")
        .single();

      if (insertError) throw new Error(insertError.message);
      const created = data as AvulsaSignatureRow;
      resetForm();
      setMessage(`Requisição avulsa ${created.avulsa_codigo || ""} enviada para assinatura.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar documento avulso.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Admin / Requisições avulsas</p>
        <h2 className="text-2xl text-foreground">Enviar requisição avulsa</h2>
      </div>

      {message ? (
        <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </Card>
      ) : null}
      {error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : (
        <Card className="p-5">
          <form
            className="grid gap-6 xl:grid-cols-[minmax(340px,0.9fr)_minmax(460px,1.1fr)]"
            onSubmit={submit}
          >
            <section className="space-y-3 rounded-md border bg-muted/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Selecionar destinatário</h3>
                  <p className="text-xs text-muted-foreground">
                    Nome/login e local de quem vai receber
                  </p>
                </div>
                <span className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
                  {filteredUsers.length} de {users.length}
                </span>
              </div>

              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  disabled={saving}
                  className="pl-9"
                  placeholder="Pesquisar por nome/login ou local"
                />
              </label>

              <div className="max-h-80 overflow-y-auto rounded-md border bg-background">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Nenhum usuário encontrado nessa busca.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const selected = (user.option_key || user.id) === selectedUserId;
                    return (
                      <button
                        key={user.option_key || user.id}
                        type="button"
                        className={`flex w-full flex-wrap items-center gap-2 border-b px-3 py-2.5 text-left text-xs transition last:border-b-0 ${
                          selected
                            ? "bg-emerald-50 text-emerald-900"
                            : "text-foreground hover:bg-muted/50"
                        }`}
                        disabled={saving}
                        onClick={() => setSelectedUserId(user.option_key || user.id)}
                      >
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {getUserRecipientName(user)}
                        </span>
                        <span className="max-w-full truncate rounded-md border bg-muted/30 px-2 py-1 text-muted-foreground">
                          {getUserLocation(user)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="min-h-12 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                {selectedUser ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">
                      Enviando para: {getUserListLabel(selectedUser)}
                    </p>
                    <p>Confira o destinatário antes de anexar o PDF.</p>
                  </div>
                ) : (
                  "Selecione um usuário na lista para confirmar o destinatário."
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-md border bg-background p-4">
              <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                <label className="space-y-2 text-sm text-muted-foreground">
                  Título
                  <Input
                    value={titulo}
                    onChange={(event) => setTitulo(event.target.value)}
                    disabled={saving}
                    placeholder="Ex: Termo avulso para assinatura"
                  />
                </label>
                <label className="space-y-2 text-sm text-muted-foreground">
                  Número do SIG
                  <Input
                    value={saidaCodigo}
                    onChange={(event) => setSaidaCodigo(event.target.value)}
                    disabled={saving}
                    placeholder="Ex: 12345"
                  />
                </label>
              </div>

              <label className="space-y-2 text-sm text-muted-foreground">
                Mensagem para o usuário
                <Textarea
                  value={observacao}
                  onChange={(event) => setObservacao(event.target.value)}
                  disabled={saving}
                  placeholder="Explique o que é este pacote e o que precisa ser assinado"
                  rows={5}
                />
              </label>

              <div className="flex flex-col gap-3 rounded-md border bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">PDFs</p>
                  {files.length > 0 ? (
                    <p className="max-w-md truncate text-xs text-muted-foreground">
                      {files.length === 1 ? files[0].name : `${files.length} PDFs selecionados`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nenhum PDF selecionado</p>
                  )}
                </div>
                <input
                  id="avulsa-admin-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    setFiles(Array.from(event.target.files || []));
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 sm:shrink-0"
                  disabled={saving}
                  onClick={() => document.getElementById("avulsa-admin-file")?.click()}
                >
                  <Upload className="h-4 w-4" />
                  Anexar PDFs
                </Button>
              </div>

              <div className="flex justify-end">
                <Button type="submit" className="min-w-40 gap-2" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Enviar
                </Button>
              </div>
            </section>
          </form>
        </Card>
      )}
    </div>
  );
}
