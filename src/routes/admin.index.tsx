import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FilePlus,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getOutputSignedAttachment, getRequestSignedAttachment } from "@/lib/attachments";
import { getRequestOwnerCpf, getRequestOwnerLocation } from "@/lib/request-owner";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

type PendingSignatureRequest = {
  id: string;
  saida_codigo: string | null;
  solicitante?: string | null;
  data?: string | null;
  created_at?: string;
  status: string;
  signed_attachment: unknown;
};

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
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPendingModal, setShowPendingModal] = useState(false);

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
          const [{ data, count, error }, completedRes] = await Promise.all([
            supabase
              .from("requisicoes")
              .select("id,saida_codigo,solicitante,data,created_at,status,signed_attachment", {
                count: "exact",
              })
              .in("status", ["recebido", "requisicao_assinada"])
              .order("updated_at", { ascending: false }),
            supabase
              .from("requisicoes")
              .select("id", { count: "exact", head: true })
              .eq("status", "concluido"),
          ]);

          if (error) throw new Error(error.message);
          if (!active) return;

          const pendingRequests = count ? ((data ?? []) as PendingSignatureRequest[]) : [];
          setPendingCount(count ?? pendingRequests.length);
          setCompletedCount(completedRes.count ?? 0);
          return;
        }

        const cpf = getRequestOwnerCpf(profile);
        const location = getRequestOwnerLocation(profile);
        const name = profile.nome?.trim() || "";

        if (!cpf && !(name && location)) {
          if (active) {
            setPendingCount(0);
          }
          return;
        }

        let query = supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at,status,signed_attachment")
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "aguardando_assinatura_saida",
            "correcao_requisicao",
          ])
          .order("updated_at", { ascending: false });

        if (cpf) {
          query = query.eq("solicitante_cpf", cpf);
        } else {
          query = query.eq("solicitante", name).eq("setor", location);
        }

        const { data, error } = await query;

        if (error) throw new Error(error.message);
        if (!active) return;

        const pendingRequests = ((data ?? []) as PendingSignatureRequest[]).filter(needsSignature);
        setPendingCount(pendingRequests.length);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHomeNotification();

    return () => {
      active = false;
    };
  }, []);

  const pendingTargetUrl = isAdmin ? "/admin/solicitacoes" : "/admin/minhas-assinaturas";

  const notificationMessage = isAdmin
    ? pendingCount > 0
      ? `Você tem ${pendingCount} ${pendingCount === 1 ? "solicitação pendente" : "solicitações pendentes"}.`
      : "Você não tem solicitações pendentes no momento."
    : pendingCount > 0
      ? "Atenção, você precisa assinar suas requisições para prosseguir."
      : "Você não tem requisições pendentes de assinatura no momento.";

  return (
    <div className="space-y-6">
      {/* HEADER DA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Comunicados</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central de avisos e requisições do sistema
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isAdmin && pendingCount > 0) {
              setShowPendingModal(true);
            } else {
              navigate({ to: "/admin/requisicao" });
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer self-start sm:self-auto"
        >
          <FilePlus className="w-4 h-4" />
          Nova Requisição
        </button>
      </div>

      {/* MODAL COMPACTO DE ASSINATURAS PENDENTES AO CLICAR EM NOVA REQUISIÇÃO */}
      <Dialog open={showPendingModal} onOpenChange={setShowPendingModal}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-base font-bold text-slate-800">
              Assinaturas Pendentes
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Você não pode fazer novos pedidos porque tem assinaturas pendentes.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => setShowPendingModal(false)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-600/20"
              onClick={() => {
                setShowPendingModal(false);
                navigate({ to: "/admin/minhas-assinaturas" });
              }}
            >
              Ver Assinaturas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BANNER PRINCIPAL DE COMUNICADOS */}
      {loading ? (
        <Card className="flex items-center gap-2 p-6 rounded-2xl border-slate-200 bg-white text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          Carregando comunicados...
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => navigate({ to: pendingTargetUrl })}
          className={`group flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 rounded-2xl p-5 text-left transition-all duration-200 border shadow-xs hover:brightness-95 ${
            pendingCount > 0
              ? "bg-amber-400 text-slate-900 border-amber-500/80 shadow-amber-400/20"
              : "bg-emerald-600 text-white border-emerald-700 shadow-emerald-600/10"
          }`}
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{notificationMessage}</span>
              <span className="underline underline-offset-4 font-semibold text-xs">
                Clique aqui para abrir
              </span>
            </div>
          </div>

          <ChevronRight
            className="w-6 h-6 shrink-0 transition-transform group-hover:translate-x-1"
            strokeWidth={2.5}
          />
        </button>
      )}
    </div>
  );
}
