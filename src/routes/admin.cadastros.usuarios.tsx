import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/usuarios")({
  component: UsuariosPage,
});

interface Usuario {
  id: string;
  nome: string;
  cpf: string | null;
  usuario: string | null;
  setor: string | null;
  unidade_nome: string | null;
  programa_id: string | null;
  materiais_permitidos: unknown;
  programas: { nome: string } | { nome: string }[] | null;
}

function getProgram(value: Usuario["programas"]) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function UsuariosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/usuarios";
  const { data, loading, error } = useSupabaseList<Usuario>(
    "usuarios",
    "id,nome,cpf,usuario,setor,unidade_nome,programa_id,materiais_permitidos,programas(nome),created_at",
  );

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "usuario", label: "Usuário", render: (r) => r.usuario || "-" },
    { key: "cpf", label: "CPF", render: (r) => r.cpf || "-" },
    { key: "unidade_nome", label: "Setor", render: (r) => r.unidade_nome || r.setor || "-" },
    {
      key: "programas",
      label: "Programa",
      render: (r) => formatProgramName(getProgram(r.programas)?.nome) || "-",
    },
    {
      key: "materiais_permitidos",
      label: "Materiais autorizados",
      render: (r) =>
        Array.isArray(r.materiais_permitidos) && r.materiais_permitidos.length > 0
          ? r.materiais_permitidos.map(String).join(", ")
          : "-",
    },
  ];

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <ListPage
      breadcrumb="Cadastros / Usuários"
      title="Usuários"
      description="Cadastre acesso, setor, programa e materiais autorizados para cada usuário."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "usuario", "cpf", "setor", "unidade_nome"]}
      newLabel="Novo usuário"
      onNew={() =>
        navigate({
          to: "/admin/cadastros/usuarios/$usuarioId",
          params: { usuarioId: "novo" },
        })
      }
      actions={(usuario) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({
              to: "/admin/cadastros/usuarios/$usuarioId",
              params: { usuarioId: usuario.id },
            })
          }
        >
          Editar
        </Button>
      )}
    />
  );
}
