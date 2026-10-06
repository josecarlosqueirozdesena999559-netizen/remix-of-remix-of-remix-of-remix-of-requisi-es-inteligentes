import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMyCpf } from "@/lib/admin-user-actions";
import {
  isSharedSectorProfile,
  isUserProfileIncomplete,
  type CurrentUserProfile,
} from "@/lib/user-profile";

type CpfCompletionDialogProps = {
  profile: CurrentUserProfile | null;
  isSharedSession: boolean;
  isCompletingProfile: boolean;
  mustRegisterWhatsApp: boolean;
  onSaved: (cpf: string) => void;
};

export function CpfCompletionDialog({
  profile,
  isSharedSession,
  isCompletingProfile,
  mustRegisterWhatsApp,
  onSaved,
}: CpfCompletionDialogProps) {
  const [open, setOpen] = useState(false);
  const [cpf, setCpf] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldAskForCpf =
    Boolean(profile?.id) &&
    !profile?.cpf?.trim() &&
    !isSharedSession &&
    !isSharedSectorProfile(profile) &&
    !isUserProfileIncomplete(profile) &&
    !isCompletingProfile &&
    !mustRegisterWhatsApp;

  useEffect(() => {
    if (!shouldAskForCpf) {
      setOpen(false);
      return;
    }

    setCpf("");
    setError(null);
    setOpen(true);
  }, [shouldAskForCpf, profile?.id, profile?.cpf]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cpfDigits = cpf.replace(/\D/g, "");

    if (cpfDigits.length !== 11) {
      setError("Informe um CPF com 11 dígitos.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveMyCpf({ data: { cpf: cpfDigits } });
      onSaved(cpfDigits);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o CPF.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="rounded-2xl sm:max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Complete seu cadastro</DialogTitle>
          <DialogDescription>
            Informe seu CPF para associar corretamente suas solicitações e documentos ao seu
            cadastro.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="profile-cpf">CPF</Label>
            <Input
              id="profile-cpf"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={cpf}
              onChange={(event) => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="Digite os 11 números"
              disabled={saving}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full gap-2 rounded-xl"
            disabled={saving || cpf.replace(/\D/g, "").length !== 11}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar CPF
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
