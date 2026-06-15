import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getOutputSignedAttachment,
  getRequestSignedAttachment,
} from "@/lib/attachments";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

type PendingSignatureRequest = {
  id: string;
  saida_codigo: string | null;
  solicitante?: string | null;
  status: string;
  signed_attachment: unknown;
};

type PendingNoticeItem = {
  key: string;
  label: string;
};

function getRequestDisplayCode(request: PendingSignatureRequest) {
  return request.saida_codigo?.trim() || request.id.slice(0, 8);
}

function buildPendingNoticeItem(request: PendingSignatureRequest, includeRequester = false): PendingNoticeItem {
  const code = getRequestDisplayCode(request);
  const requester = request.solicitante?.trim();

  return {
    key: request.id,
    label: includeRequester && requester ? `Requisição ${code} - ${requester}` : `Requisição ${code}`,
  };
}

function needsSignature(request: PendingSignatureRequest) {
  if (request.status === "aguardando_assinatura_saida") {
    return !getOutputSignedAttachment(request.signed_attachment, request.status);
  }

  return !getRequestSignedAttachment(request.signed_attachment, request.status);
}

function AdminHome() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingNoticeItems, setPendingNoticeItems] = useState<PendingNoticeItem[]>([]);
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
            setPendingNoticeItems([]);
          }
          return;
        }

        if (active) {
          setIsAdmin(profile.is_admin === true);
        }

        if (profile.is_admin) {
          const { data, count, error } = await supabase
            .from("requisicoes")
            .select("id,saida_codigo,solicitante,status,signed_attachment", { count: "exact" })
            .in("status", ["recebido", "requisicao_assinada"])
            .order("updated_at", { ascending: false });

          if (error) throw new Error(error.message);
          if (!active) return;

          const pendingRequests = count ? ((data ?? []) as PendingSignatureRequest[]) : [];
          setPendingCount(count ?? pendingRequests.length);
          setPendingNoticeItems(pendingRequests.map((request) => buildPendingNoticeItem(request, true)));
          return;
        }

        if (!profile.cpf) {
          if (active) {
            setPendingCount(0);
            setPendingNoticeItems([]);
          }
          return;
        }

        const { data, error } = await supabase
          .from("requisicoes")
          .select("id,saida_codigo,status,signed_attachment")
          .eq("solicitante_cpf", profile.cpf)
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "aguardando_assinatura_saida",
            "correcao_requisicao",
          ])
          .order("updated_at", { ascending: false });

        if (error) throw new Error(error.message);
        if (!active) return;

        const pendingRequests = ((data ?? []) as PendingSignatureRequest[]).filter(needsSignature);
        setPendingCount(pendingRequests.length);
        setPendingNoticeItems(pendingRequests.map((request) => buildPendingNoticeItem(request)));
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
      ? `Você tem ${pendingCount} ${
          pendingCount === 1 ? "requisição pendente de assinatura" : "requisições pendentes de assinatura"
        }.`
      : "Você não tem requisições pendentes de assinatura no momento.";

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
          <span className="min-w-0 flex-1 space-y-2 text-sm font-medium leading-snug sm:text-base">
            <span className="block">
              {notificationMessage}{" "}
              <span className="cursor-pointer whitespace-nowrap underline decoration-1 underline-offset-4">
                Clique aqui
              </span>
            </span>
            {pendingNoticeItems.length > 0 ? (
              <span className="block space-y-1 text-sm font-normal">
                {pendingNoticeItems.map((item) => (
                  <span key={item.key} className="block">
                    {item.label}
                  </span>
                ))}
              </span>
            ) : null}
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
