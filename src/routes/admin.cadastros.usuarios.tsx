import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatLocationName } from "@/lib/location-normalizer";
import { normalizeProductCategory } from "@/lib/product-options";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/usuarios")({
  component: UsuariosPage,
});

interface Usuario {
  id: string;
  nome: string;
  usuario: string | null;
  cpf: string | null;
  setor: string | null;
  unidade_nome: string | null;
  categorias_permitidas: unknown;
}

function UsuariosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/usuarios";
  const { data, loading, error } = useSupabaseList<Usuario>("usuarios");

  const renderCategorias = (r: Usuario) => {
    const cats = Array.isArray(r.categorias_permitidas)
      ? r.categorias_permitidas.map((categoria) => normalizeProductCategory(String(categoria)))
      : [];
    if (cats.length === 0) {
      return <span className="text-muted-foreground">Nenhum tipo liberado</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {cats.map((c, i) => (
          <Badge key={i} variant="secondary">
            {String(c)}
          </Badge>
        ))}
      </div>
    );
  };

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "usuario", label: "Usuário", render: (r) => r.usuario || "—" },
    { key: "cpf", label: "CPF", render: (r) => r.cpf || "—" },
    {
      key: "unidade_nome",
      label: "Local",
      render: (r) => formatLocationName(r.unidade_nome || r.setor) || "—",
    },
    { key: "setor", label: "Programa", render: (r) => formatProgramName(r.setor) || "—" },
    { key: "categorias_permitidas", label: "Tipos que pode pedir", render: renderCategorias },
  ];

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <ListPage
      breadcrumb="Cadastros / Usuários"
      title="Usuários"
      description="Lista de usuários cadastrados no sistema."
      data={data}
      loading={loading}
      error={error}
      columns={columns}
      searchKeys={["nome", "usuario", "cpf"]}
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
