import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSelectedSharedRequesterId,
  getSelectedSharedRequesterProfile,
} from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/selecionar-solicitante")({
  component: SelecionarSolicitantePage,
});

function SelecionarSolicitantePage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function redirectLegacySelectionPage() {
      try {
        const { user, profile } = await getCurrentUserProfile();
        if (!active) return;

        if (!user || !profile) {
          clearSelectedSharedRequesterId();
          await supabase.auth.signOut();
          navigate({ to: "/" });
          return;
        }

        if (!isSharedSectorProfile(profile)) {
          navigate({ to: "/admin" });
          return;
        }

        const selectedRequester = await getSelectedSharedRequesterProfile(profile);
        if (!active) return;

        if (selectedRequester) {
          navigate({ to: "/admin" });
          return;
        }

        clearSelectedSharedRequesterId();
        await supabase.auth.signOut();
        navigate({ to: "/" });
      } catch {
        clearSelectedSharedRequesterId();
        await supabase.auth.signOut();
        if (active) navigate({ to: "/" });
      }
    }

    void redirectLegacySelectionPage();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Validando o acesso selecionado...
    </div>
  );
}
