import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Folder, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/locais")({
  component: SetoresPage,
});

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
}

function SetoresPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/locais";
  const { data, loading, error } = useSupabaseList<Setor>(
    "setores",
    "id,nome,programa,created_at,setor_programas(programas(id,nome))",
    { column: "created_at", ascending: false },
    ["setores", "setor_programas", "programas"],
  );

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Setores</p>
          <h2 className="text-2xl text-foreground">Setores</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra uma pasta para gerenciar os responsaveis daquele setor.
          </p>
        </div>
        <Button
          type="button"
          className="w-full gap-2 sm:w-auto"
          onClick={() =>
            navigate({
              to: "/admin/cadastros/locais/$localId",
              params: { localId: "novo" },
            })
          }
        >
          <Plus className="h-4 w-4" />
          Novo setor
        </Button>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando setores...</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">{error}</Card>
      ) : !data?.length ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum setor cadastrado.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((setor) => (
            (() => {
              const linkedProgramas =
                setor.setor_programas?.map((item) => item.programas?.nome).filter(Boolean) ?? [];
              const label = linkedProgramas.length
                ? linkedProgramas.map((programa) => formatProgramName(programa)).join(", ")
                : formatProgramName(setor.programa) || "Sem programa vinculado";

              return (
            <button
              key={setor.id}
              type="button"
              onClick={() =>
                navigate({
                  to: "/admin/cadastros/locais/$localId",
                  params: { localId: String(setor.id) },
                })
              }
              className="flex min-h-28 items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Folder className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-foreground">{setor.nome}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {label}
                </span>
              </span>
            </button>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
}
