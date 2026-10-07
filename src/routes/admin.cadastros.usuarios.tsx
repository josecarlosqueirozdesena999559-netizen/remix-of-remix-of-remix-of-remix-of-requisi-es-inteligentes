import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";

export const Route = createFileRoute("/admin/cadastros/usuarios")({
  component: UsuariosPage,
});

interface SetorRelation {
  nome: string | null;
}

interface SetorResponsavelRelation {
  setores: SetorRelation | SetorRelation[] | null;
}

interface Usuario {
  id: string;
  nome: string;
  cpf: string | null;
  setor: string | null;
  unidade_nome: string | null;
  materiais_permitidos: unknown;
  setor_responsaveis?: SetorResponsavelRelation[] | null;
}

const USER_SELECT =
  "id,nome,cpf,setor,unidade_nome,materiais_permitidos,setor_responsaveis(setores(nome)),created_at";
const USER_REALTIME_TABLES = ["usuarios", "setor_responsaveis", "setores"];

function getSectorNames(user: Usuario) {
  return (user.setor_responsaveis ?? [])
    .flatMap((link) => (Array.isArray(link.setores) ? link.setores : [link.setores]))
    .map((sector) => sector?.nome?.trim() || "")
    .filter(Boolean);
}

function getSharedSector(user: Usuario) {
  const linkedSectors = getSectorNames(user);
  const primaryName = user.unidade_nome?.trim() || user.setor?.trim();
  if (primaryName) {
    const match = linkedSectors.find(
      (name) => name.localeCompare(primaryName, "pt-BR", { sensitivity: "base" }) === 0,
    );
    if (match) return match;
  }
  return primaryName || linkedSectors[0] || "Sem setor";
}

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
    USER_REALTIME_TABLES,
  );

  const columns: Column<Usuario>[] = [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF", render: (user) => user.cpf || "-" },
    { key: "unidade_nome", label: "Setor compartilhado", render: getSharedSector },
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
      description="Pessoas, setor compartilhado e materiais autorizados. Os vínculos e programas são gerenciados em Setores."
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
