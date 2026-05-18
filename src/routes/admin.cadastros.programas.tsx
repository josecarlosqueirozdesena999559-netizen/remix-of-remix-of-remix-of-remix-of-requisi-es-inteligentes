import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/programas")({
  component: ProgramasPage,
});

interface Programa {
  id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
}

function ProgramasPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useSupabaseList<Programa>("programas");

  const columns: Column<Programa>[] = [
    { key: "nome", label: "Nome", render: (programa) => formatProgramName(programa.nome) },
  ];

  return (
    <ListPage
      breadcrumb="Cadastros / Programas"
      title="Programas"
      description="Programas vinculados a produtos do almoxarifado."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      actions={(programa) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() =>
            navigate({
              to: "/admin/cadastros/programas/$programaId",
              params: { programaId: programa.id },
            })
          }
        >
          <Pencil className="h-4 w-4" />
          Editar
        </Button>
      )}
      searchKeys={["nome"]}
      newLabel="Novo programa"
      onNew={() =>
        navigate({
          to: "/admin/cadastros/programas/$programaId",
          params: { programaId: "novo" },
        })
      }
    />
  );
}
