import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getSharedSectorUsers,
  setSelectedSharedRequesterId,
} from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile, type CurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/selecionar-solicitante")({
  component: SelecionarSolicitantePage,
});

function getCategoryLabels(raw: unknown) {
  if (!Array.isArray(raw)) return ["Sem materiais liberados"];

  const labels = raw.map(String).filter(Boolean);
  return labels.length > 0 ? labels : ["Sem materiais liberados"];
}

function SelecionarSolicitantePage() {
  const navigate = useNavigate();
  const [sharedProfile, setSharedProfile] = useState<CurrentUserProfile | null>(null);
  const [users, setUsers] = useState<CurrentUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { profile } = await getCurrentUserProfile();

        if (!isSharedSectorProfile(profile)) {
          navigate({ to: "/admin" });
          return;
        }

        const sectorUsers = await getSharedSectorUsers(profile);

        if (!active) return;

        setSharedProfile(profile);
        setUsers(sectorUsers);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Erro ao carregar usuarios do posto.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSelect = (user: CurrentUserProfile) => {
    setSavingId(user.id);
    setSelectedSharedRequesterId(user.id);
    navigate({ to: "/admin" });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{sharedProfile?.nome || "Posto"}</p>
        <h2 className="text-2xl text-foreground">Quem esta usando o sistema?</h2>
      </div>

      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando usuarios...
        </Card>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : users.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhum usuario real foi encontrado para este posto.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {users.map((user) => (
            <Card key={user.id} className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-foreground">{user.nome}</h3>
                  <p className="text-sm text-muted-foreground">{user.funcao || "Sem funcao"}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {getCategoryLabels(user.categorias_permitidas).map((category) => (
                  <Badge key={category} variant="outline" className="rounded-md text-xs">
                    {category}
                  </Badge>
                ))}
              </div>

              <Button
                type="button"
                className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={Boolean(savingId)}
                onClick={() => handleSelect(user)}
              >
                {savingId === user.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Entrar como este usuario
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}