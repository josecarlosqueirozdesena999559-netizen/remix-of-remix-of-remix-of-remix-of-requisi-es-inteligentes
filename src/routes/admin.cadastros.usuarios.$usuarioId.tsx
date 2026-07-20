import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { deleteAdminUser, saveAdminUser } from "@/lib/admin-user-actions";

export const Route = createFileRoute("/admin/cadastros/usuarios/$usuarioId")({
  component: UsuarioFormPage,
});

interface UsuarioRow {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  usuario: string | null;
}

function UsuarioFormPage() {
  const { usuarioId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = usuarioId === "novo";

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("123456");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo usuario" : "Editar usuario"), [isNew]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      if (isNew) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("usuarios")
        .select("id,nome,cpf,email,usuario")
        .eq("id", usuarioId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Usuario nao encontrado.");
        setLoading(false);
        return;
      }

      const usuario = data as UsuarioRow;
      setNome(usuario.nome);
      setCpf(usuario.cpf ?? "");
      setEmail(usuario.email ?? "");
      setSenha("");
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [isNew, usuarioId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim().toLowerCase();

    if (!nomeLimpo || !emailLimpo) {
      setError("Informe nome e email.");
      setSaving(false);
      return;
    }

    const payload = {
      id: isNew ? null : usuarioId,
      nome: nomeLimpo,
      usuario: emailLimpo.split("@")[0] || emailLimpo,
      email: emailLimpo,
      cpf: cpf.trim() || null,
      password: senha.trim() || null,
    };

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      await saveAdminUser({ data: { ...payload, accessToken } });
      setSaving(false);
      navigate({ to: "/admin/cadastros/usuarios" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuario.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isNew) return;

    setDeleting(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada. Entre novamente.");

      await deleteAdminUser({ data: { id: usuarioId, accessToken } });
      setDeleteOpen(false);
      navigate({ to: "/admin/cadastros/usuarios" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir usuario.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Usuarios</p>
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
          <form className="max-w-2xl space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
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
                  onChange={(event) => setCpf(event.target.value)}
                  placeholder="CPF"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@exemplo.com"
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
                placeholder={isNew ? "Senha" : "Deixe em branco para manter"}
                required={isNew}
                minLength={isNew || senha ? 6 : undefined}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="gap-2" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
                  Excluir usuario
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuario</DialogTitle>
            <DialogDescription>
              Esta acao remove o cadastro e o login do usuario.
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
