import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";

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
    { key: "nome", label: "Nome" },
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
      searchKeys={["nome"]}
      newLabel="Novo programa"
      onNew={() => navigate({ to: "/admin/cadastros/programas/novo" })}
    />
  );
}