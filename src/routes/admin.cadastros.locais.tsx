import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/locais")({
  component: LocaisPage,
});

interface Setor {
  id: number;
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  programa: string | null;
}

function LocaisPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useSupabaseList<Setor>("setores");

  const columns: Column<Setor>[] = [
    { key: "nome", label: "Nome", render: (r) => formatProgramName(r.nome) || r.nome },
    { key: "responsavel", label: "Responsável", render: (r) => r.responsavel || "—" },
    { key: "programa", label: "Programa", render: (r) => formatProgramName(r.programa) || "—" },
    { key: "descricao", label: "Descrição", render: (r) => r.descricao || "—" },
  ];

  return (
    <ListPage
      breadcrumb="Cadastros / Locais"
      title="Locais"
      description="Setores e locais cadastrados no sistema."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "responsavel", "programa"]}
      newLabel="Novo local"
      onNew={() => navigate({ to: "/admin/cadastros/locais/novo" })}
    />
  );
}
