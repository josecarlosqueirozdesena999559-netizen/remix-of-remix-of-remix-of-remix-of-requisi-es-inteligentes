import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadHomeNotification() {
      setLoading(true);

      try {
        const { profile } = await getCurrentUserProfile();

        if (!profile) {
          if (active) {
            setIsAdmin(false);
            setPendingCount(0);
          }
          return;
        }

        if (active) {
          setIsAdmin(profile.is_admin === true);
        }

        if (profile.is_admin) {
          const { count, error } = await supabase
            .from("requisicoes")
            .select("id", { count: "exact", head: true })
            .in("status", ["recebido", "requisicao_assinada"]);

          if (error) throw new Error(error.message);
          if (!active) return;

          setPendingCount(count ?? 0);
          return;
        }

        if (!profile.cpf) {
          if (active) setPendingCount(0);
          return;
        }

        const { count, error } = await supabase
          .from("requisicoes")
          .select("id", { count: "exact", head: true })
          .eq("solicitante_cpf", profile.cpf)
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "aguardando_assinatura_saida",
            "correcao_requisicao",
          ]);

        if (error) throw new Error(error.message);
        if (!active) return;

        setPendingCount(count ?? 0);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHomeNotification();

    return () => {
      active = false;
    };
  }, []);

  const notificationMessage = isAdmin
    ? pendingCount > 0
      ? `Você tem ${pendingCount} ${pendingCount === 1 ? "solicitação pendente" : "solicitações pendentes"}.`
      : "Você não tem solicitações pendentes no momento."
    : pendingCount > 0
      ? `Você tem ${pendingCount} ${pendingCount === 1 ? "assinatura para preencher" : "assinaturas para preencher"}.`
      : "Você não tem assinaturas pendentes no momento.";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Início</p>
        <h2 className="text-2xl text-foreground">Comunicados</h2>
      </div>

      {loading ? (
        <Card className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando comunicados...
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => navigate({ to: isAdmin ? "/admin/solicitacoes" : "/admin/minhas-assinaturas" })}
          className={`group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-black shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-16 sm:px-5 ${
            pendingCount > 0 ? "bg-amber-400" : "bg-emerald-400"
          }`}
        >
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug sm:text-base">
            {notificationMessage}{" "}
            <span className="cursor-pointer whitespace-nowrap underline decoration-1 underline-offset-4">
              Clique aqui
            </span>
          </span>
          <ChevronRight
            className="size-5 shrink-0 transition-transform group-hover:translate-x-1"
            strokeWidth={2.5}
          />
        </button>
      )}
    </div>
  );
}
