import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";

export const Route = createFileRoute("/admin/cadastros/usuarios")({
  component: UsuariosPage,
});

interface Usuario {
  id: string;
  nome: string;
  cpf: string | null;
  materiais_permitidos: unknown;
}

const USER_SELECT = "id,nome,cpf,materiais_permitidos,created_at";

function getMaterials(value: unknown) {
  return Array.isArray(value) && value.length > 0
    ? value.map(String).join(", ")
    : "Nenhum material liberado";
}

function UsuariosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/usuarios";
  const { data, loading, error } = useSupabaseList<Usuario>(
    "usuarios",
    USER_SELECT,
    { column: "created_at", ascending: false },
    ["usuarios"],
  );

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF", render: (user) => user.cpf || "-" },
    {
      key: "materiais_permitidos",
      label: "Materiais que pode pedir",
      render: (user) => getMaterials(user.materiais_permitidos),
    },
  ];

  if (isChildRoute) return <Outlet />;

  return (
    <ListPage
      breadcrumb="Cadastros / Usuários"
      title="Usuários"
      description="Pessoas cadastradas e tipos de materiais autorizados para solicitação."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "cpf"]}
      newLabel="Novo usuário"
      onNew={() =>
        navigate({
          to: "/admin/cadastros/usuarios/$usuarioId",
          params: { usuarioId: "novo" },
        })
      }
      actions={(user) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({
              to: "/admin/cadastros/usuarios/$usuarioId",
              params: { usuarioId: user.id },
            })
          }
        >
          Editar
        </Button>
      )}
    />
  );
}
