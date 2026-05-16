import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { deleteAdminUser, saveAdminUser } from "@/lib/admin-user-actions";
import { formatLocationName } from "@/lib/location-normalizer";
import { normalizeProductCategory, PRODUCT_CATEGORIES } from "@/lib/product-options";
import { formatProgramName } from "@/lib/program-options";
import type { CheckedState } from "@radix-ui/react-checkbox";

export const Route = createFileRoute("/admin/cadastros/usuarios/$usuarioId")({
  component: UsuarioFormPage,
});

interface UsuarioRow {
  id: string;
  nome: string;
  usuario: string | null;
  email: string;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  categorias_permitidas: unknown;
}

interface LocalRow {
  id: number;
  nome: string;
  programa: string | null;
}

interface ProgramaRow {
  id: string;
  nome: string;
}

const EMPTY_SELECT_VALUE = "__none__";

function UsuarioFormPage() {
  const { usuarioId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = usuarioId === "novo";

  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [funcao, setFuncao] = useState("");
  const [senha, setSenha] = useState("123456");
  const [setor, setSetor] = useState("");
  const [unidadeNome, setUnidadeNome] = useState("");
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [categoriasPermitidas, setCategoriasPermitidas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo usuário" : "Editar usuário"), [isNew]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const [locaisResult, programasResult, usuarioResult] = await Promise.all([
        supabase.from("setores").select("id,nome,programa").order("nome", { ascending: true }),
        supabase.from("programas").select("id,nome").order("nome", { ascending: true }),
        isNew
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from("usuarios")
              .select("id,nome,usuario,email,cpf,funcao,setor,unidade_nome,categorias_permitidas")
              .eq("id", usuarioId)
              .maybeSingle(),
      ]);

      if (!active) return;

      if (locaisResult.error || programasResult.error) {
        setError(
          locaisResult.error?.message ||
            programasResult.error?.message ||
            "Erro ao carregar locais e programas.",
        );
        setLoading(false);
        return;
      }

      setLocais((locaisResult.data ?? []) as LocalRow[]);
      setProgramas((programasResult.data ?? []) as ProgramaRow[]);

      if (isNew) {
        setLoading(false);
        return;
      }

      const { data, error } = usuarioResult;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Usuário não encontrado.");
        setLoading(false);
        return;
      }

      const usuario = data as UsuarioRow;
      setNome(usuario.nome);
      setUsuario(usuario.usuario ?? "");
      setEmail(usuario.email);
      setCpf(usuario.cpf ?? "");
      setFuncao(usuario.funcao ?? "");
      setSenha("");
      setSetor(usuario.setor ?? "");
      setUnidadeNome(usuario.unidade_nome ?? "");
      setCategoriasPermitidas(
        Array.isArray(usuario.categorias_permitidas)
          ? usuario.categorias_permitidas.map(String).map(normalizeProductCategory)
          : [],
      );
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [isNew, usuarioId]);

  const handleCategoriaCheckedChange = (categoria: string, checked: CheckedState) => {
    setCategoriasPermitidas((current) => {
      const normalizedCategory = normalizeProductCategory(categoria);
      const nextValues = checked
        ? [...current, normalizedCategory]
        : current.filter((item) => item !== normalizedCategory);

      return nextValues.filter((item, index, values) => item && values.indexOf(item) === index);
    });
  };

  const handleLocalChange = (value: string) => {
    const nextLocal = value === EMPTY_SELECT_VALUE ? "" : value;
    setUnidadeNome(nextLocal);

    const local = locais.find((item) => item.nome === nextLocal);
    if (local?.programa) {
      setSetor(formatProgramName(local.programa));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const nomeLimpo = nome.trim();
    const usuarioLimpo = usuario.trim();

    if (!nomeLimpo || !usuarioLimpo) {
      setError("Informe nome e usuário de acesso.");
      setSaving(false);
      return;
    }

    const payload = {
      id: isNew ? null : usuarioId,
      nome: nomeLimpo,
      usuario: usuarioLimpo,
      email: email.trim() || null,
      cpf: cpf.trim() || null,
      funcao: funcao.trim() || null,
      setor: setor.trim() || null,
      unidade_nome: unidadeNome.trim() || null,
      categorias_permitidas: categoriasPermitidas
        .map(normalizeProductCategory)
        .filter((categoria, index, categorias) => {
          return Boolean(categoria) && categorias.indexOf(categoria) === index;
        }),
      password: senha.trim() || null,
    };

    try {
      await saveAdminUser({ data: payload });
      setSaving(false);
      navigate({ to: "/admin/cadastros/usuarios" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuário.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteAdminUser({ data: { id: usuarioId } });
      setDeleteOpen(false);
      navigate({ to: "/admin/cadastros/usuarios" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir usuário.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Usuários</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => navigate({ to: "/admin/cadastros/usuarios" })}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="flex h-32 items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <form className="max-w-4xl space-y-6" onSubmit={handleSubmit}>
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-medium text-foreground">Acesso</h3>
                <p className="text-sm text-muted-foreground">
                  O usuario entra no sistema usando somente o usuario de acesso e a senha.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="usuario">Usuario de acesso</Label>
                  <Input
                    id="usuario"
                    value={usuario}
                    onChange={(event) => setUsuario(event.target.value)}
                    placeholder="Usuario de acesso"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senha">{isNew ? "Senha inicial" : "Nova senha"}</Label>
                  <Input
                    id="senha"
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder={isNew ? "Senha inicial" : "Deixe em branco para manter"}
                    required={isNew}
                    minLength={isNew || senha ? 6 : undefined}
                  />
                  <p className="text-sm text-muted-foreground">
                    {isNew
                      ? "A senha e criada pelo admin e pode ser usada no primeiro acesso."
                      : "Preencha apenas se quiser trocar a senha de acesso."}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div>
                <h3 className="text-base font-medium text-foreground">Dados do usuario</h3>
                <p className="text-sm text-muted-foreground">
                  Dados usados para identificar requisicoes, assinaturas e permissoes.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  placeholder="Nome completo"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  placeholder="CPF"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidade">Local</Label>
                <Select value={unidadeNome || EMPTY_SELECT_VALUE} onValueChange={handleLocalChange}>
                  <SelectTrigger id="unidade">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sem local</SelectItem>
                    {locais.map((local) => (
                      <SelectItem key={local.id} value={local.nome}>
                        {formatLocationName(local.nome)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setor">Programa</Label>
                <Select
                  value={setor || EMPTY_SELECT_VALUE}
                  onValueChange={(value) => setSetor(value === EMPTY_SELECT_VALUE ? "" : value)}
                >
                  <SelectTrigger id="setor">
                    <SelectValue placeholder="Selecione o programa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sem programa</SelectItem>
                    {programas.map((programa) => (
                      <SelectItem key={programa.id} value={programa.nome}>
                        {formatProgramName(programa.nome)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="funcao">Função</Label>
                <Input
                  id="funcao"
                  value={funcao}
                  onChange={(event) => setFuncao(event.target.value)}
                  placeholder="Cargo ou funcao"
                />
              </div>
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div>
                <h3 className="text-base font-medium text-foreground">Permissoes de produtos</h3>
                <p className="text-sm text-muted-foreground">
                  Os itens carregam quando o tipo do produto estiver liberado aqui.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRODUCT_CATEGORIES.map((categoria) => (
                  <label
                    key={categoria}
                    htmlFor={`categoria-${normalizeProductCategory(categoria)}`}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      id={`categoria-${normalizeProductCategory(categoria)}`}
                      checked={categoriasPermitidas.includes(categoria)}
                      onCheckedChange={(checked) =>
                        handleCategoriaCheckedChange(categoria, checked)
                      }
                    />
                    <span>{categoria}</span>
                  </label>
                ))}
              </div>
            </section>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
            {!isNew && (
              <Button
                type="button"
                variant="destructive"
                className="ml-2 gap-2"
                disabled={saving || deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Excluir usuário
              </Button>
            )}
          </form>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              Esta ação remove o cadastro e o login do usuário. As requisições já feitas continuam
              no histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
