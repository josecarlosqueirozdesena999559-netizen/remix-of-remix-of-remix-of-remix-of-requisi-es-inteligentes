import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deleteAdminUser, saveAdminUser } from "@/lib/admin-user-actions";
import { normalizeProductCategory, PRODUCT_CATEGORIES } from "@/lib/product-options";

export const Route = createFileRoute("/admin/cadastros/usuarios/$usuarioId")({
  component: UsuarioFormPage,
});

interface UsuarioRow {
  id: string;
  nome: string;
  cpf: string | null;
  usuario: string | null;
  is_admin: boolean;
  categorias_permitidas: unknown;
  materiais_permitidos: unknown;
}

const MATERIAL_CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES);

function getValidMaterialCategories(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map(String)
    .map(normalizeProductCategory)
    .filter(
      (category, index, categories) =>
        MATERIAL_CATEGORY_SET.has(category) && categories.indexOf(category) === index,
    );
}

function UsuarioFormPage() {
  const { usuarioId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = usuarioId === "novo";

  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [materiaisPermitidos, setMateriaisPermitidos] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = isNew ? "Novo usuário" : "Editar usuário";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      if (isNew) {
        setNome("");
        setUsuario("");
        setCpf("");
        setSenha("");
        setMateriaisPermitidos([]);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("usuarios")
        .select("id,nome,cpf,usuario,is_admin,categorias_permitidas,materiais_permitidos")
        .eq("id", usuarioId)
        .maybeSingle();

      if (!active) return;
      if (loadError || !data) {
        setError(loadError?.message || "Usuário não encontrado.");
        setLoading(false);
        return;
      }

      const profile = data as UsuarioRow;
      setNome(profile.nome);
      setUsuario(profile.usuario ?? "");
      setCpf(profile.cpf ?? "");
      setSenha("");
      setIsAdmin(profile.is_admin);
      const explicitMaterials = getValidMaterialCategories(profile.materiais_permitidos);
      const legacyMaterials = getValidMaterialCategories(profile.categorias_permitidas);
      setMateriaisPermitidos(explicitMaterials.length > 0 ? explicitMaterials : legacyMaterials);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [isNew, usuarioId]);

  const toggleMaterial = (category: string) => {
    setMateriaisPermitidos((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const nomeLimpo = nome.trim();
    const usuarioLimpo = usuario.trim();
    const cpfLimpo = cpf.replace(/\D/g, "");
    const senhaLimpa = senha.trim();

    if (!nomeLimpo || !usuarioLimpo) {
      setError("Informe o nome e o usuário de acesso.");
      setSaving(false);
      return;
    }
    if (!isAdmin && materiaisPermitidos.length === 0) {
      setError("Selecione ao menos um tipo de material permitido.");
      setSaving(false);
      return;
    }
    if (cpfLimpo && cpfLimpo.length !== 11) {
      setError("Informe um CPF com 11 dígitos.");
      setSaving(false);
      return;
    }
    if (isNew && senhaLimpa.length < 6) {
      setError("A senha inicial precisa ter pelo menos 6 caracteres.");
      setSaving(false);
      return;
    }
    if (senhaLimpa && senhaLimpa.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      setSaving(false);
      return;
    }

    const payload = {
      id: isNew ? null : usuarioId,
      nome: nomeLimpo,
      usuario: usuarioLimpo,
      cpf: cpfLimpo || null,
      password: senhaLimpa || null,
      materiais_permitidos: materiaisPermitidos,
    };

    try {
      await saveAdminUser({ data: payload });
      navigate({ to: "/admin/cadastros/usuarios" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuário.");
    } finally {
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
          <form className="max-w-3xl space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da pessoa</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome completo"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="Somente números"
                  inputMode="numeric"
                  maxLength={11}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usuario">Usuário de acesso</Label>
                <Input
                  id="usuario"
                  value={usuario}
                  onChange={(event) => setUsuario(event.target.value)}
                  placeholder="Identificador interno da conta"
                  autoCapitalize="none"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">{isNew ? "Senha" : "Nova senha"}</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder={isNew ? "Senha inicial" : "Deixe em branco para manter"}
                required={isNew}
                minLength={isNew || senha ? 6 : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {isNew
                  ? "A senha inicial precisa ter pelo menos 6 caracteres."
                  : "Informe uma nova senha para redefinir; deixe em branco para manter a atual."}
              </p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              O setor compartilhado e os programas são definidos em Cadastros / Setores. Aqui você
              configura a pessoa e os tipos de materiais permitidos.
            </div>

            <fieldset className="space-y-3 rounded-md border p-4">
              <div>
                <legend className="font-medium">Materiais que pode pedir</legend>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selecione os tipos de materiais permitidos para esta pessoa.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRODUCT_CATEGORIES.map((category, index) => {
                  const inputId = `material-category-${index}`;
                  return (
                    <div key={category} className="flex items-center gap-2">
                      <Checkbox
                        id={inputId}
                        checked={materiaisPermitidos.includes(category)}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setMateriaisPermitidos((current) =>
                              current.includes(category) ? current : [...current, category],
                            );
                          } else {
                            toggleMaterial(category);
                          }
                        }}
                      />
                      <Label htmlFor={inputId} className="cursor-pointer font-normal">
                        {category}
                      </Label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {materiaisPermitidos.length} tipo(s) selecionado(s)
              </p>
            </fieldset>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="gap-2" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  variant="destructive"
                  className="gap-2"
                  disabled={saving || deleting}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir usuário
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>Esta ação remove o cadastro e o login do usuário.</DialogDescription>
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
