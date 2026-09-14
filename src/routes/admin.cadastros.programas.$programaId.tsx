import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/cadastros/programas/$programaId")({
  component: ProgramaFormPage,
});

interface ProgramaRow {
  id: string;
  nome: string;
  descricao: string | null;
}

function ProgramaFormPage() {
  const { programaId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = programaId === "novo";

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo programa" : "Editar programa"), [isNew]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      if (isNew) {
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("programas")
        .select("id,nome,descricao")
        .eq("id", programaId)
        .maybeSingle();

      if (!active) return;

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Programa nao encontrado.");
        setLoading(false);
        return;
      }

      const programa = data as ProgramaRow;
      setNome(programa.nome);
      setDescricao(programa.descricao ?? "");
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [isNew, programaId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setError("Informe o nome do programa.");
      setSaving(false);
      return;
    }

    const payload = {
      nome: nomeLimpo,
      descricao: descricao.trim() || null,
    };

    const result = isNew
      ? await supabase.from("programas").insert(payload)
      : await supabase.from("programas").update(payload).eq("id", programaId);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess("Programa salvo com sucesso.");

    if (isNew) {
      navigate({ to: "/admin/cadastros/programas" });
    }
  };

  const handleDelete = async () => {
    if (isNew) return;

    setDeleting(true);
    setError(null);

    const result = await supabase.from("programas").delete().eq("id", programaId);

    if (result.error) {
      setError(result.error.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setDeleteOpen(false);
    navigate({ to: "/admin/cadastros/programas" });
  };

  if (loading) {
    return (
      <Card className="p-6 text-muted-foreground">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Programas</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate({ to: "/admin/cadastros/programas" })}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {!isNew && (
            <Button type="button" variant="destructive" className="gap-2" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome do programa" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descricao</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Descricao do programa"
              rows={4}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-700">{success}</p>}

          <div className="flex justify-end">
            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </form>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir programa</DialogTitle>
            <DialogDescription>Essa acao remove o programa cadastrado.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
