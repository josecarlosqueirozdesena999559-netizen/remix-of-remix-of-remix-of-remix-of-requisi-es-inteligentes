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
  email: string | null;
}

function UsuariosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/usuarios";
  const { data, loading, error } = useSupabaseList<Usuario>(
    "usuarios",
    "id,nome,cpf,email,created_at",
  );

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF", render: (r) => r.cpf || "-" },
    { key: "email", label: "Email", render: (r) => r.email || "-" },
  ];

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <ListPage
      breadcrumb="Cadastros / Usuarios"
      title="Usuarios"
      description="Cadastro basico de usuarios do sistema."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "cpf", "email"]}
      newLabel="Novo usuario"
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
