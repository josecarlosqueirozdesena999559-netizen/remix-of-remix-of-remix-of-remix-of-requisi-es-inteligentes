import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/locais/$localId")({
  component: SetorDetailPage,
});

interface SetorRow {
  id: number;
  nome: string;
  programa: string | null;
  descricao: string | null;
}

interface ProgramaRow {
  id: string;
  nome: string;
}

interface UsuarioRow {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
}

interface ResponsavelRow {
  id: string;
  usuario_id: string;
  usuarios: UsuarioRow | null;
}

interface SetorProgramaRow {
  id: string;
  programa_id: string;
  programas: ProgramaRow | null;
}

const EMPTY_PROGRAM_VALUE = "__none__";
const EMPTY_USER_VALUE = "__none__";

function SetorDetailPage() {
  const { localId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = localId === "novo";

  const [setor, setSetor] = useState<SetorRow | null>(null);
  const [nome, setNome] = useState("");
  const [programa, setPrograma] = useState("");
  const [selectedProgramaIds, setSelectedProgramaIds] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [responsaveis, setResponsaveis] = useState<ResponsavelRow[]>([]);
  const [selectedUsuarioId, setSelectedUsuarioId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingSetor, setSavingSetor] = useState(false);
  const [savingResponsavel, setSavingResponsavel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(isNew);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responsavelError, setResponsavelError] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo setor" : setor?.nome || "Setor"), [isNew, setor]);
  const availableUsuarios = useMemo(
    () => usuarios.filter((usuario) => !responsaveis.some((item) => item.usuario_id === usuario.id)),
    [responsaveis, usuarios],
  );

  const loadData = async () => {
    setLoading(true);
    setError(null);

    const [programasResult, usuariosResult, setorResult, responsaveisResult, setorProgramasResult] = await Promise.all([
      supabase.from("programas").select("id,nome").order("nome", { ascending: true }),
      supabase.from("usuarios").select("id,nome,cpf,email").order("nome", { ascending: true }),
      isNew
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("setores")
            .select("id,nome,programa,descricao")
            .eq("id", Number(localId))
            .maybeSingle(),
      isNew
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("setor_responsaveis")
            .select("id,usuario_id,usuarios(id,nome,cpf,email)")
            .eq("setor_id", Number(localId))
            .order("created_at", { ascending: true }),
      isNew
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from("setor_programas")
            .select("id,programa_id,programas(id,nome)")
            .eq("setor_id", Number(localId))
            .order("created_at", { ascending: true }),
    ]);

    if (
      programasResult.error ||
      usuariosResult.error ||
      setorResult.error ||
      responsaveisResult.error ||
      setorProgramasResult.error
    ) {
      setError(
        programasResult.error?.message ||
          usuariosResult.error?.message ||
          setorResult.error?.message ||
          responsaveisResult.error?.message ||
          setorProgramasResult.error?.message ||
          "Erro ao carregar setor.",
      );
      setLoading(false);
      return;
    }

    setProgramas((programasResult.data ?? []) as ProgramaRow[]);
    setUsuarios((usuariosResult.data ?? []) as UsuarioRow[]);
    setResponsaveis((responsaveisResult.data ?? []) as ResponsavelRow[]);
    setSelectedProgramaIds(
      ((setorProgramasResult.data ?? []) as SetorProgramaRow[]).map((item) => item.programa_id),
    );

    if (isNew) {
      setSetor(null);
      setNome("");
      setPrograma("");
      setSelectedProgramaIds([]);
      setDescricao("");
      setEditOpen(true);
      setLoading(false);
      return;
    }

    if (!setorResult.data) {
      setError("Setor não encontrado.");
      setLoading(false);
      return;
    }

    const loadedSetor = setorResult.data as SetorRow;
    setSetor(loadedSetor);
    setNome(loadedSetor.nome);
    setPrograma(loadedSetor.programa ?? "");
    setDescricao(loadedSetor.descricao ?? "");
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, [isNew, localId]);

  const handleSaveSetor = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSetor(true);
    setError(null);

    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setError("Informe o nome do setor.");
      setSavingSetor(false);
      return;
    }

    const payload = {
      nome: nomeLimpo,
      programa: programa.trim() || null,
      descricao: descricao.trim() || null,
    };

    const result = isNew
      ? await supabase.from("setores").insert(payload).select("id,nome,programa,descricao").single()
      : await supabase
          .from("setores")
          .update(payload)
          .eq("id", Number(localId))
          .select("id,nome,programa,descricao")
          .single();

    if (result.error) {
      setError(result.error.message);
      setSavingSetor(false);
      return;
    }

    const setorId = Number(result.data.id);
    const deleteLinksResult = await supabase.from("setor_programas").delete().eq("setor_id", setorId);

    if (deleteLinksResult.error) {
      setError(deleteLinksResult.error.message);
      setSavingSetor(false);
      return;
    }

    if (selectedProgramaIds.length > 0) {
      const insertLinksResult = await supabase.from("setor_programas").insert(
        selectedProgramaIds.map((programaId) => ({
          setor_id: setorId,
          programa_id: programaId,
        })),
      );

      if (insertLinksResult.error) {
        setError(insertLinksResult.error.message);
        setSavingSetor(false);
        return;
      }
    }

    setSavingSetor(false);
    setEditOpen(false);

    if (isNew) {
      navigate({
        to: "/admin/cadastros/locais/$localId",
        params: { localId: String(result.data.id) },
      });
      return;
    }

    setSetor(result.data as SetorRow);
  };

  const handleDeleteSetor = async () => {
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

  const handleAddResponsavel = async () => {
    if (isNew || !selectedUsuarioId) return;

    setSavingResponsavel(true);
    setResponsavelError(null);

    const result = await supabase.from("setor_responsaveis").insert({
      setor_id: Number(localId),
      usuario_id: selectedUsuarioId,
    });

    if (result.error) {
      setResponsavelError(result.error.message);
      setSavingResponsavel(false);
      return;
    }

    setSelectedUsuarioId("");
    setSavingResponsavel(false);
    await loadData();
  };

  const handleRemoveResponsavel = async (id: string) => {
    const result = await supabase.from("setor_responsaveis").delete().eq("id", id);
    if (result.error) {
      setResponsavelError(result.error.message);
      return;
    }
    setResponsaveis((current) => current.filter((item) => item.id !== id));
  };

  const togglePrograma = (programaId: string) => {
    setSelectedProgramaIds((current) =>
      current.includes(programaId)
        ? current.filter((id) => id !== programaId)
        : [...current, programaId],
    );
  };

  const selectedProgramasLabel =
    selectedProgramaIds
      .map((programaId) => programas.find((programa) => programa.id === programaId)?.nome)
      .filter(Boolean)
      .map((programa) => formatProgramName(programa))
      .join(", ") || formatProgramName(setor?.programa) || "Sem programa vinculado";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Setores</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
          {!isNew && (
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedProgramasLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => navigate({ to: "/admin/cadastros/locais" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {!isNew && (
            <>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Editar setor
              </Button>
              <Button type="button" variant="destructive" className="gap-2" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Excluir setor
              </Button>
            </>
          )}
        </div>
      </div>

      {error && <Card className="p-4 text-sm text-destructive">{error}</Card>}

      {!isNew && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-2">
              <Label>Adicionar responsável</Label>
              <Select
                value={selectedUsuarioId || EMPTY_USER_VALUE}
                onValueChange={(value) =>
                  setSelectedUsuarioId(value === EMPTY_USER_VALUE ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_USER_VALUE}>Selecione um usuário</SelectItem>
                  {availableUsuarios.map((usuario) => (
                    <SelectItem key={usuario.id} value={usuario.id}>
                      {usuario.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              className="gap-2"
              disabled={!selectedUsuarioId || savingResponsavel}
              onClick={handleAddResponsavel}
            >
              {savingResponsavel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Salvar responsável
            </Button>
          </div>

          {responsavelError && <p className="text-sm text-destructive">{responsavelError}</p>}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {responsaveis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Nenhum responsável vinculado.
                    </TableCell>
                  </TableRow>
                ) : (
                  responsaveis.map((responsavel) => (
                    <TableRow key={responsavel.id}>
                      <TableCell>{responsavel.usuarios?.nome || "-"}</TableCell>
                      <TableCell>{responsavel.usuarios?.cpf || "-"}</TableCell>
                      <TableCell>{responsavel.usuarios?.email || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="gap-2"
                          onClick={() => void handleRemoveResponsavel(responsavel.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remover
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={(open) => (!isNew ? setEditOpen(open) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo setor" : "Editar setor"}</DialogTitle>
            <DialogDescription>Informe os dados básicos do setor.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveSetor}>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do setor</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome do setor"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Local principal</Label>
              <Select
                value={programa || EMPTY_PROGRAM_VALUE}
                onValueChange={(value) => setPrograma(value === EMPTY_PROGRAM_VALUE ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_PROGRAM_VALUE}>Sem local</SelectItem>
                  {programas.map((item) => (
                    <SelectItem key={item.id} value={item.nome}>
                      {formatProgramName(item.nome)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Programas vinculados</Label>
                <p className="text-sm text-muted-foreground">
                  Os responsaveis deste setor so veem materiais liberados para estes programas.
                </p>
              </div>
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
                {programas.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 rounded-md p-2 text-sm hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={selectedProgramaIds.includes(item.id)}
                      onCheckedChange={() => togglePrograma(item.id)}
                    />
                    <span>{formatProgramName(item.nome)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Observacoes</Label>
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                placeholder="Informacoes adicionais"
                rows={3}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              {!isNew && (
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" className="gap-2" disabled={savingSetor}>
                {savingSetor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir setor</DialogTitle>
            <DialogDescription>
              Essa acao remove o setor e seus responsaveis vinculados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              onClick={() => void handleDeleteSetor()}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
