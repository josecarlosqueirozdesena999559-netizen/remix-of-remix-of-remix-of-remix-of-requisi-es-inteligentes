import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Folder, FolderTree, Pencil, UserRound } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { normalizeProductCategory } from "@/lib/product-options";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/setores-principais")({
  component: SetoresPrincipaisPage,
});

interface Usuario {
  id: string;
  nome: string;
  usuario: string | null;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  categorias_permitidas: unknown;
}

interface ResponsavelRow {
  setor_id: number;
  usuarios: Usuario | Usuario[] | null;
}

interface Setor {
  id: number;
  nome: string;
  programa: string | null;
  setor_programas?: {
    programas: {
      id: string;
      nome: string;
    } | null;
  }[];
  setor_responsaveis?: ResponsavelRow[];
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isSharedLogin(user: Usuario) {
  return normalizeText(user.funcao) === "LOGIN COMPARTILHADO";
}

function getLinkedProgramLabel(setor: Setor) {
  const linkedProgramas =
    setor.setor_programas?.map((item) => item.programas?.nome).filter(Boolean) ?? [];

  if (linkedProgramas.length > 0) {
    return linkedProgramas.map((programa) => formatProgramName(programa)).join(", ");
  }

  return formatProgramName(setor.programa) || "Sem programa vinculado";
}

function getSingleUser(value: Usuario | Usuario[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isDuplicatedDentalFolder(setor: Setor) {
  return normalizeText(setor.nome).includes("ODONTO");
}

function getUsers(setor: Setor) {
  const seen = new Set<string>();

  return (setor.setor_responsaveis ?? [])
    .map((row) => getSingleUser(row.usuarios))
    .filter((user): user is Usuario => Boolean(user))
    .filter((user) => !isSharedLogin(user))
    .filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

function getCategoryLabels(raw: unknown) {
  const categories = Array.isArray(raw)
    ? raw.map(String).map(normalizeProductCategory).filter(Boolean)
    : [];
  const unique = categories.filter((category, index) => categories.indexOf(category) === index);

  return unique.length > 0 ? unique : ["Sem materiais liberados"];
}

function SetoresPrincipaisPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useSupabaseList<Setor>(
    "setores",
    "id,nome,programa,created_at,setor_programas(programas(id,nome)),setor_responsaveis(setor_id,usuarios(id,nome,usuario,cpf,funcao,setor,unidade_nome,categorias_permitidas))",
    { column: "nome", ascending: true },
    ["setores", "setor_programas", "programas", "setor_responsaveis", "usuarios"],
  );
  const setores = useMemo(() => {
    const seen = new Set<string>();

    return (data ?? []).filter((setor) => {
      if (isDuplicatedDentalFolder(setor)) return false;

      const key = normalizeText(setor.nome);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data]);
  const totalUsuarios = setores.reduce((total, setor) => total + getUsers(setor).length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Setores principais</p>
          <h2 className="text-2xl text-foreground">Setores Principais</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-2 rounded-md px-3 py-2 text-sm">
            <FolderTree className="h-4 w-4 text-primary" />
            {setores.length} pastas
          </Badge>
          <Badge variant="outline" className="gap-2 rounded-md px-3 py-2 text-sm">
            <UserRound className="h-4 w-4 text-primary" />
            {totalUsuarios} usuários
          </Badge>
        </div>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando setores principais...</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">{error}</Card>
      ) : setores.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum setor cadastrado.</Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {setores.map((setor) => {
            const users = getUsers(setor);

            return (
              <Card key={setor.id} className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Folder className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-foreground">{setor.nome}</h3>
                      <p className="text-sm text-muted-foreground">{getLinkedProgramLabel(setor)}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      navigate({
                        to: "/admin/cadastros/locais/$localId",
                        params: { localId: String(setor.id) },
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                </div>

                <div className="space-y-2">
                  {users.length === 0 ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Nenhum usuário vinculado a este posto.
                    </div>
                  ) : (
                    users.map((user) => (
                      <div key={user.id} className="rounded-md border bg-card p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{user.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.funcao || "Sem função"}{user.usuario ? ` · ${user.usuario}` : ""}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              navigate({
                                to: "/admin/cadastros/usuarios/$usuarioId",
                                params: { usuarioId: user.id },
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {getCategoryLabels(user.categorias_permitidas).map((category) => (
                            <Badge key={category} variant="outline" className="rounded-md text-xs">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}