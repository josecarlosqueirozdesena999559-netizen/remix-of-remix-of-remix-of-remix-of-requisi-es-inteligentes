import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentUserProfile,
  isUserProfileIncomplete,
  type CurrentUserProfile,
} from "@/lib/user-profile";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [openCadastros, setOpenCadastros] = useState(pathname.startsWith("/admin/cadastros"));
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin/cadastros")) setOpenCadastros(true);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function checkProfile() {
      if (pathname === "/admin/completar-cadastro") return;

      try {
        const { user, profile } = await getCurrentUserProfile();

        if (!active) return;

        if (!user) {
          navigate({ to: "/" });
          return;
        }

        setProfile(profile);

        if (isUserProfileIncomplete(profile)) {
          navigate({ to: "/admin/completar-cadastro" });
        }
      } catch {
        if (active) navigate({ to: "/" });
      }
    }

    checkProfile();

    return () => {
      active = false;
    };
  }, [navigate, pathname]);

  const itemCls =
    "block rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors";
  const activeCls = "bg-sidebar-accent text-sidebar-foreground";
  const isAdmin = profile?.is_admin !== false;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground p-4 flex flex-col">
        <div className="px-3 py-4 text-xl mb-4 border-b border-sidebar-border">
          Almoxarifado
        </div>
        <nav className="flex-1 space-y-1">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            className={itemCls}
            activeProps={{ className: `${itemCls} ${activeCls}` }}
          >
            Início
          </Link>

          {isAdmin ? (
            <>
              <Link
                to="/admin/solicitacoes"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Solicitações Pendentes
              </Link>
              <Link
                to="/admin/assinadas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Assinadas
              </Link>
              <Link
                to="/admin/controle-assinaturas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Controle de Assinaturas
              </Link>

              <button
                type="button"
                onClick={() => setOpenCadastros((value) => !value)}
                className={`${itemCls} w-full text-left flex items-center justify-between`}
              >
                <span>Cadastros</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${openCadastros ? "rotate-0" : "-rotate-90"}`}
                />
              </button>
              <div
                className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
                  openCadastros ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="ml-3 space-y-1 border-l border-sidebar-border pl-2 pt-1">
                    <Link
                      to="/admin/cadastros/usuarios"
                      className={itemCls}
                      activeProps={{ className: `${itemCls} ${activeCls}` }}
                    >
                      Usuários
                    </Link>
                    <Link
                      to="/admin/cadastros/produtos"
                      className={itemCls}
                      activeProps={{ className: `${itemCls} ${activeCls}` }}
                    >
                      Produtos
                    </Link>
                    <Link
                      to="/admin/cadastros/programas"
                      className={itemCls}
                      activeProps={{ className: `${itemCls} ${activeCls}` }}
                    >
                      Programas
                    </Link>
                    <Link
                      to="/admin/cadastros/locais"
                      className={itemCls}
                      activeProps={{ className: `${itemCls} ${activeCls}` }}
                    >
                      Locais
                    </Link>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/admin/requisicao"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Criar Requisição
              </Link>
              <Link
                to="/admin/minhas-assinaturas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Minhas Assinaturas
              </Link>
              <Link
                to="/admin/meus-assinados"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Assinados
              </Link>
            </>
          )}

          <Link
            to="/admin/configuracoes"
            className={itemCls}
            activeProps={{ className: `${itemCls} ${activeCls}` }}
          >
            Configurações
          </Link>

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
            className={`${itemCls} w-full text-left mt-4`}
          >
            Sair
          </button>
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
