import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/completar-cadastro")({
  component: CompletarCadastroPage,
});

function CompletarCadastroPage() {
  const navigate = useNavigate();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [funcao, setFuncao] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { user, profile } = await getCurrentUserProfile();

        if (!active) return;

        if (!user) {
          navigate({ to: "/" });
          return;
        }

        setAuthUserId(user.id);
        setUsuarioId(profile?.id ?? null);
        setNome(profile?.nome ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "");
        setEmail(profile?.email ?? user.email ?? "");
        setFuncao(profile?.funcao ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar cadastro.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const funcaoLimpa = funcao.trim();

    if (!funcaoLimpa) {
      setError("Informe sua função para continuar.");
      setSaving(false);
      return;
    }

    const result = usuarioId
      ? await supabase
          .from("usuarios")
          .update({ auth_user_id: authUserId, funcao: funcaoLimpa })
          .eq("id", usuarioId)
          .select("id")
          .single()
      : await supabase
          .from("usuarios")
          .insert({
            auth_user_id: authUserId,
            nome: nome || email,
            email,
            funcao: funcaoLimpa,
            role: "usuario",
            is_admin: false,
          })
          .select("id")
          .single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate({ to: "/admin" });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Cadastro obrigatório</p>
        <h2 className="text-2xl text-foreground">Informe sua função</h2>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="flex h-32 items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <p className="text-sm text-muted-foreground">
              A função aparece junto ao seu nome na requisição e na assinatura do PDF.
            </p>

            <div className="space-y-2">
              <Label htmlFor="funcao">Função</Label>
              <Input
                id="funcao"
                value={funcao}
                onChange={(event) => setFuncao(event.target.value)}
                placeholder="Função"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e continuar
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
