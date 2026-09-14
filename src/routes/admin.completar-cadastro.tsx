import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Briefcase, FileCheck2, Loader2, Save, UserCheck } from "lucide-react";
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
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-100">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 mb-3">
            <UserCheck className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold tracking-widest text-emerald-700 uppercase">
            Cadastro Obrigatório
          </span>
          <h2 className="text-xl font-black text-slate-800 tracking-tight mt-1">
            Informe sua Função
          </h2>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Sua função aparecerá junto ao seu nome na requisição e na assinatura de documentos.
          </p>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-emerald-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs font-semibold text-slate-600">Carregando dados...</span>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label
                htmlFor="funcao"
                className="text-xs font-bold text-slate-700 uppercase tracking-wider"
              >
                Função / Cargo
              </Label>
              <div className="relative">
                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="funcao"
                  value={funcao}
                  onChange={(event) => setFuncao(event.target.value)}
                  placeholder="Ex: Almoxarife, Assistente, Diretor..."
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-center text-xs font-semibold text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="h-11 w-full gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar e Continuar
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
