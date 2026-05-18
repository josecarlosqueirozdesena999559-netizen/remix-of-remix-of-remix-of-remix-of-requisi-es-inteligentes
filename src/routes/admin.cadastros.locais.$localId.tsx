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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/locais/$localId")({
  component: LocalFormPage,
});

interface LocalRow {
  id: number;
  nome: string;
  responsavel: string | null;
  programa: string | null;
  descricao: string | null;
}

interface ProgramaRow {
  id: string;
  nome: string;
}

const EMPTY_PROGRAM_VALUE = "__none__";

function LocalFormPage() {
  const { localId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = localId === "novo";

  const [nome, setNome] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [programa, setPrograma] = useState("");
  const [descricao, setDescricao] = useState("");
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo local" : "Editar local"), [isNew]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const [programasResult, localResult] = await Promise.all([
        supabase.from("programas").select("id,nome").order("nome", { ascending: true }),
        isNew
          ? Promise.resolve({ data: null, error: null })
          : supabase.from("setores").select("id,nome,responsavel,programa,descricao").eq("id", Number(localId)).maybeSingle(),
      ]);

      if (!active) return;

      if (programasResult.error) {
        setError(programasResult.error.message);
        setLoading(false);
        return;
      }

      setProgramas((programasResult.data ?? []) as ProgramaRow[]);

      if (isNew) {
        setLoading(false);
        return;
      }

      if (localResult.error) {
        setError(localResult.error.message);
        setLoading(false);
        return;
      }

      if (!localResult.data) {
        setError("Local nao encontrado.");
        setLoading(false);
        return;
      }

      const local = localResult.data as LocalRow;
      setNome(local.nome);
      setResponsavel(local.responsavel ?? "");
      setPrograma(local.programa ?? "");
      setDescricao(local.descricao ?? "");
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [isNew, localId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setError("Informe o nome do local.");
      setSaving(false);
      return;
    }

    const payload = {
      nome: nomeLimpo,
      responsavel: responsavel.trim() || null,
      programa: programa.trim() || null,
      descricao: descricao.trim() || null,
    };

    const result = isNew
      ? await supabase.from("setores").insert(payload)
      : await supabase.from("setores").update(payload).eq("id", Number(localId));

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess("Local salvo com sucesso.");

    if (isNew) {
      navigate({ to: "/admin/cadastros/locais" });
    }
  };

  const handleDelete = async () => {
    if (isNew) return;

    setDeleting(true);
    setError(null);

    const result = await supabase.from("setores").delete().eq("id", Number(localId));

    if (result.error) {
      setError(result.error.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setDeleteOpen(false);
    navigate({ to: "/admin/cadastros/locais" });
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
          <p className="text-sm text-muted-foreground">Cadastros / Locais</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={() => navigate({ to: "/admin/cadastros/locais" })}>
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
            <Input id="nome" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Nome do local" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="responsavel">Responsavel</Label>
            <Input
              id="responsavel"
              value={responsavel}
              onChange={(event) => setResponsavel(event.target.value)}
              placeholder="Responsavel pelo local"
            />
          </div>

          <div className="space-y-2">
            <Label>Programa</Label>
            <Select value={programa || EMPTY_PROGRAM_VALUE} onValueChange={(value) => setPrograma(value === EMPTY_PROGRAM_VALUE ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um programa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_PROGRAM_VALUE}>Sem programa</SelectItem>
                {programas.map((item) => (
                  <SelectItem key={item.id} value={item.nome}>
                    {formatProgramName(item.nome)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descricao</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(event) => setDescricao(event.target.value)}
              placeholder="Descricao do local"
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
            <DialogTitle>Excluir local</DialogTitle>
            <DialogDescription>Essa acao remove o local cadastrado.</DialogDescription>
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
