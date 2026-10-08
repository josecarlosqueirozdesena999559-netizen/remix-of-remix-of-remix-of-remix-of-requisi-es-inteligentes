import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  usuario: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  is_admin: boolean;
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

interface SetorResponsavelSyncRow {
  setores:
    | {
        id: number;
        nome: string;
        programa: string | null;
        setor_programas: { programa_id: string }[] | null;
      }
    | {
        id: number;
        nome: string;
        programa: string | null;
        setor_programas: { programa_id: string }[] | null;
      }[]
    | null;
}

function normalizeSectorName(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getSingleSyncSector(value: SetorResponsavelSyncRow["setores"]) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const EMPTY_USER_VALUE = "__none__";

function SetorDetailPage() {
  const { localId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = localId === "novo";

  const [setor, setSetor] = useState<SetorRow | null>(null);
  const [nome, setNome] = useState("");
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
    () =>
      usuarios.filter(
        (usuario) =>
          !usuario.is_admin &&
          normalizeSectorName(usuario.funcao) !== "login compartilhado" &&
          !responsaveis.some((item) => item.usuario_id === usuario.id),
      ),
    [responsaveis, usuarios],
  );
  const visibleResponsaveis = useMemo(
    () =>
      responsaveis.filter(
        (responsavel) =>
          normalizeSectorName(responsavel.usuarios?.funcao) !== "login compartilhado",
      ),
    [responsaveis],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [programasResult, usuariosResult, setorResult, responsaveisResult, setorProgramasResult] =
      await Promise.all([
        supabase.from("programas").select("id,nome").order("nome", { ascending: true }),
        supabase
          .from("usuarios")
          .select("id,nome,cpf,usuario,funcao,setor,unidade_nome,is_admin")
          .order("nome", { ascending: true }),
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
              .select(
                "id,usuario_id,usuarios(id,nome,cpf,usuario,funcao,setor,unidade_nome,is_admin)",
              )
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

    const loadedPrograms = (programasResult.data ?? []) as ProgramaRow[];
    setProgramas(loadedPrograms);
    setUsuarios((usuariosResult.data ?? []) as UsuarioRow[]);
    setResponsaveis((responsaveisResult.data ?? []) as ResponsavelRow[]);

    if (isNew) {
      setSetor(null);
      setNome("");
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
    const linkedProgramIds = ((setorProgramasResult.data ?? []) as SetorProgramaRow[]).map(
      (item) => item.programa_id,
    );
    const legacyProgram = loadedSetor.programa
      ? loadedPrograms.find(
          (item) => normalizeSectorName(item.nome) === normalizeSectorName(loadedSetor.programa),
        )
      : null;

    setSetor(loadedSetor);
    setNome(loadedSetor.nome);
    setSelectedProgramaIds(
      linkedProgramIds.length ? linkedProgramIds : legacyProgram ? [legacyProgram.id] : [],
    );
    setDescricao(loadedSetor.descricao ?? "");
    setLoading(false);
  }, [isNew, localId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (isNew) return;

    let active = true;
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (active) void loadData();
      }, 120);
    };

    const channel = supabase
      .channel(`sector-detail:${localId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "setor_responsaveis",
          filter: `setor_id=eq.${Number(localId)}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "setor_programas",
          filter: `setor_id=eq.${Number(localId)}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "setores", filter: `id=eq.${Number(localId)}` },
        refresh,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, refresh)
      .subscribe();

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [isNew, localId, loadData]);

  const syncUsuarioSetor = async (usuarioId: string, preferredSetorId?: number) => {
    const [linksResult, profileResult] = await Promise.all([
      supabase
        .from("setor_responsaveis")
        .select("setores(id,nome,programa,setor_programas(programa_id))")
        .eq("usuario_id", usuarioId)
        .order("created_at", { ascending: true }),
      supabase.from("usuarios").select("setor,unidade_nome").eq("id", usuarioId).maybeSingle(),
    ]);

    if (linksResult.error) throw new Error(linksResult.error.message);
    if (profileResult.error) throw new Error(profileResult.error.message);

    const linkedSetores = ((linksResult.data ?? []) as SetorResponsavelSyncRow[])
      .map((item) => getSingleSyncSector(item.setores))
      .filter((item): item is NonNullable<ReturnType<typeof getSingleSyncSector>> => Boolean(item));
    const currentPrimary = normalizeSectorName(
      profileResult.data?.unidade_nome || profileResult.data?.setor,
    );
    const nextSetor =
      linkedSetores.find((item) => item.id === preferredSetorId) ??
      linkedSetores.find((item) => normalizeSectorName(item.nome) === currentPrimary) ??
      linkedSetores[0] ??
      null;

    const updateResult = await supabase
      .from("usuarios")
      .update({
        setor: nextSetor?.programa || nextSetor?.nome || null,
        unidade_nome: nextSetor?.nome || null,
        programa_id: nextSetor?.setor_programas?.[0]?.programa_id ?? null,
      })
      .eq("id", usuarioId);

    if (updateResult.error) throw new Error(updateResult.error.message);
  };

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

    const firstProgramName = selectedProgramaIds
      .map((programaId) => programas.find((programa) => programa.id === programaId)?.nome)
      .find(Boolean);
    const payload = {
      nome: nomeLimpo,
      programa: firstProgramName || null,
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
    const deleteLinksResult = await supabase
      .from("setor_programas")
      .delete()
      .eq("setor_id", setorId);

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

    try {
      await Promise.all(
        responsaveis.map((responsavel) => syncUsuarioSetor(responsavel.usuario_id, setorId)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar pessoas vinculadas.");
      setSavingSetor(false);
      return;
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

    const linkedUsersResult = await supabase
      .from("setor_responsaveis")
      .select("usuario_id")
      .eq("setor_id", Number(localId));
    if (linkedUsersResult.error) {
      setError(linkedUsersResult.error.message);
      setDeleting(false);
      return;
    }

    const result = await supabase.from("setores").delete().eq("id", Number(localId));

    if (result.error) {
      setError(result.error.message);
      setDeleting(false);
      return;
    }

    try {
      const userIds = [
        ...new Set(
          ((linkedUsersResult.data ?? []) as { usuario_id: string | null }[])
            .map((link) => link.usuario_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      await Promise.all(userIds.map((userId) => syncUsuarioSetor(userId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar os setores das pessoas.");
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

    try {
      await syncUsuarioSetor(selectedUsuarioId, Number(localId));
    } catch (err) {
      await supabase
        .from("setor_responsaveis")
        .delete()
        .eq("setor_id", Number(localId))
        .eq("usuario_id", selectedUsuarioId);
      setResponsavelError(
        err instanceof Error ? err.message : "Erro ao atualizar o setor da pessoa.",
      );
      setSavingResponsavel(false);
      return;
    }

    setSelectedUsuarioId("");
    setSavingResponsavel(false);
    await loadData();
  };

  const handleRemoveResponsavel = async (id: string) => {
    const responsavel = responsaveis.find((item) => item.id === id);
    if (!responsavel) return;

    const result = await supabase.from("setor_responsaveis").delete().eq("id", id);
    if (result.error) {
      setResponsavelError(result.error.message);
      return;
    }

    try {
      await syncUsuarioSetor(responsavel.usuario_id);
    } catch (err) {
      await supabase.from("setor_responsaveis").insert({
        setor_id: Number(localId),
        usuario_id: responsavel.usuario_id,
      });
      setResponsavelError(
        err instanceof Error ? err.message : "Erro ao atualizar o setor da pessoa.",
      );
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
      .join(", ") ||
    formatProgramName(setor?.programa) ||
    "Sem programa vinculado";

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
          {!isNew && <p className="mt-1 text-sm text-muted-foreground">{selectedProgramasLabel}</p>}
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
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                Editar setor
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                onClick={() => setDeleteOpen(true)}
              >
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
              <Label>Vincular pessoa</Label>
              <Select
                value={selectedUsuarioId || EMPTY_USER_VALUE}
                onValueChange={(value) =>
                  setSelectedUsuarioId(value === EMPTY_USER_VALUE ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma pessoa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_USER_VALUE}>Selecione uma pessoa</SelectItem>
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
              Vincular pessoa
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            O vínculo e os programas do setor são aplicados imediatamente. Ao remover uma pessoa sem
            outro vínculo, ela ficará sem setor.
          </p>

          {responsavelError && <p className="text-sm text-destructive">{responsavelError}</p>}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleResponsaveis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      Nenhuma pessoa vinculada.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleResponsaveis.map((responsavel) => (
                    <TableRow key={responsavel.id}>
                      <TableCell>{responsavel.usuarios?.nome || "-"}</TableCell>
                      <TableCell>{responsavel.usuarios?.cpf || "-"}</TableCell>
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
            <DialogDescription>
              Defina o setor e os programas que ele pode solicitar.
            </DialogDescription>
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
            <div className="space-y-3">
              <div>
                <Label>Programas liberados para este setor</Label>
                <p className="text-sm text-muted-foreground">
                  As pessoas vinculadas poderão solicitar materiais apenas nos programas
                  selecionados.
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
              <Label htmlFor="descricao">Observações</Label>
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                placeholder="Informações adicionais"
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
                {savingSetor ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
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
              As pessoas perderão este vínculo; quem não tiver outro setor ficará sem setor e sem
              acesso a solicitações.
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
