import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getSharedSectorUsers,
  setSelectedSharedRequesterId,
} from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile, type CurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/selecionar-solicitante")({
  component: SelecionarSolicitantePage,
});

function SelecionarSolicitantePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [users, setUsers] = useState<CurrentUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { user, profile: currentProfile } = await getCurrentUserProfile();
        if (!user || !currentProfile) {
          await supabase.auth.signOut();
          navigate({ to: "/" });
          return;
        }
        if (!isSharedSectorProfile(currentProfile)) {
          navigate({ to: "/admin" });
          return;
        }
        const sectorUsers = await getSharedSectorUsers(currentProfile);
        if (!active) return;
        setProfile(currentProfile);
        setUsers(sectorUsers);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar os usuários do setor.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [navigate]);

  const selectUser = (user: CurrentUserProfile) => {
    setSelectedSharedRequesterId(user.id);
    navigate({ to: "/admin" });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando usuários do setor...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="-translate-y-16 w-full max-w-lg border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div>
            <p className="text-sm text-slate-500">Login realizado</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-950">Selecione o usuário do setor</h1>
            <p className="mt-2 text-sm text-slate-500">
              {profile?.unidade_nome || profile?.setor || "Setor compartilhado"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : users.length === 0 ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Nenhum usuário está vinculado a este setor.
          </p>
        ) : (
          <div className="grid gap-3">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => selectUser(user)}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <UserRound className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-medium text-slate-900">{user.nome}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {user.funcao || user.usuario || "Usuário do setor"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
