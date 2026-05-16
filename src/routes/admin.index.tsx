import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
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
          className={`group flex min-h-28 w-full items-center gap-5 rounded-lg px-6 py-7 text-left text-black shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-32 sm:px-9 md:gap-8 md:px-12 ${
            pendingCount > 0 ? "bg-amber-400" : "bg-emerald-400"
          }`}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-black sm:size-14 md:size-16">
            {pendingCount > 0 ? (
              <AlertCircle className="size-9 sm:size-10 md:size-12" strokeWidth={2.5} />
            ) : (
              <CheckCircle2 className="size-8 sm:size-10 md:size-11" strokeWidth={2.5} />
            )}
          </span>
          <span className="min-w-0 flex-1 text-xl leading-snug sm:text-2xl md:text-3xl">
            {notificationMessage}{" "}
            <span className="whitespace-nowrap underline decoration-2 underline-offset-4">
              Clique aqui
            </span>
          </span>
          <ChevronRight
            className="size-8 shrink-0 transition-transform group-hover:translate-x-1 sm:size-10 md:size-12"
            strokeWidth={3}
          />
        </button>
      )}
    </div>
  );
}
