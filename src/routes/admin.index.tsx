import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

function AdminHome() {
  const navigate = useNavigate();
  const [signatureCounts, setSignatureCounts] = useState({
    request: 0,
    output: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSignatureCounts() {
      setLoading(true);

      try {
        const { profile } = await getCurrentUserProfile();

        if (!profile?.cpf) {
          if (active) setSignatureCounts({ request: 0, output: 0 });
          return;
        }

        const { data, error } = await supabase
          .from("requisicoes")
          .select("status")
          .eq("solicitante_cpf", profile.cpf)
          .in("status", ["aguardando_assinatura", "aguardando_assinatura_requisicao", "aguardando_assinatura_saida"]);

        if (error) throw new Error(error.message);
        if (!active) return;

        setSignatureCounts({
          request: (data ?? []).filter((request) =>
            request.status === "aguardando_assinatura" ||
            request.status === "aguardando_assinatura_requisicao",
          ).length,
          output: (data ?? []).filter(
            (request) => request.status === "aguardando_assinatura_saida",
          ).length,
        });
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSignatureCounts();

    return () => {
      active = false;
    };
  }, []);

  const totalSignatures = signatureCounts.request + signatureCounts.output;
  const signatureMessage =
    totalSignatures > 0
      ? `Você tem ${totalSignatures} ${totalSignatures === 1 ? "assinatura pendente" : "assinaturas pendentes"}.`
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
          onClick={() => navigate({ to: "/admin/minhas-assinaturas" })}
          className={`w-full rounded-md border-l-4 p-5 text-left shadow-sm transition-colors hover:brightness-[0.98] ${
            totalSignatures > 0
              ? "border-sky-500 bg-sky-50 text-sky-950"
              : "border-emerald-500 bg-emerald-50 text-emerald-950"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`rounded-md p-2 ${
                totalSignatures > 0 ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {totalSignatures > 0 ? (
                <FileSignature className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">Assinaturas</span>
              <span className="mt-1 block text-sm opacity-80">{signatureMessage}</span>
            </span>
          </div>
        </button>
      )}
    </div>
  );
}
