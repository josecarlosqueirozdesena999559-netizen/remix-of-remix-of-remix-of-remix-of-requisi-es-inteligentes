import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
} from "@/lib/attachments";
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
          const { data, error } = await supabase
            .from("requisicoes")
            .select("status,signed_attachment,admin_attachment")
            .in("status", ["recebido", "requisicao_assinada", "concluido", "aguardando_assinatura_saida"])
            .order("updated_at", { ascending: false })
            .limit(50);

          if (error) throw new Error(error.message);
          if (!active) return;

          const totalPendingRequests = (data ?? []).filter((request) => {
            const hasRequestSigned = Boolean(
              getRequestSignedAttachment(request.signed_attachment, request.status),
            );
            const hasOutputDocument = Boolean(
              getOutputSignedAttachment(request.signed_attachment, request.status) ||
                getAttachmentFile(request.admin_attachment),
            );

            return !hasOutputDocument && (
              request.status === "recebido" ||
              request.status === "requisicao_assinada" ||
              hasRequestSigned
            );
          }).length;

          setPendingCount(totalPendingRequests);
          return;
        }

        if (!profile.cpf) {
          if (active) setPendingCount(0);
          return;
        }

        const { data, error } = await supabase
          .from("requisicoes")
          .select("status")
          .eq("solicitante_cpf", profile.cpf)
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "aguardando_assinatura_saida",
            "correcao_requisicao",
          ])
          .order("updated_at", { ascending: false })
          .limit(50);

        if (error) throw new Error(error.message);
        if (!active) return;

        const signatureCounts = {
          request: (data ?? []).filter((request) =>
            request.status === "aguardando_assinatura" ||
            request.status === "aguardando_assinatura_requisicao" ||
            request.status === "correcao_requisicao",
          ).length,
          output: (data ?? []).filter(
            (request) => request.status === "aguardando_assinatura_saida",
          ).length,
        };

        setPendingCount(signatureCounts.request + signatureCounts.output);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHomeNotification();

    return () => {
      active = false;
    };
  }, []);

  const notificationTitle = isAdmin ? "Solicitações Pendentes" : "Assinaturas";
  const notificationMessage = isAdmin
    ? pendingCount > 0
      ? `Você tem ${pendingCount} ${pendingCount === 1 ? "requisição pendente" : "requisições pendentes"}.`
      : "Você não tem requisições pendentes no momento."
    : pendingCount > 0
      ? `Você tem ${pendingCount} ${pendingCount === 1 ? "assinatura pendente" : "assinaturas pendentes"}.`
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
          className={`w-full rounded-md border-l-4 p-5 text-left shadow-sm transition-colors hover:brightness-[0.98] ${
            pendingCount > 0
              ? "border-amber-500 bg-amber-50 text-amber-950"
              : "border-emerald-500 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`rounded-md p-2 ${
                pendingCount > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {pendingCount > 0 ? (
                <FileSignature className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">{notificationTitle}</span>
              <span className="mt-1 block text-sm opacity-80">{notificationMessage}</span>
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
