import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearSelectedSharedRequesterId } from "@/lib/shared-sector-session";
import { resolveLoginEmail } from "@/lib/login-options";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setLoading(false);
        return;
      }
      const { profile } = await getCurrentUserProfile();
      if (isSharedSectorProfile(profile)) {
        navigate({ to: "/admin/selecionar-solicitante" });
      } else {
        navigate({ to: "/admin" });
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    clearSelectedSharedRequesterId();
    try {
      const login = usuario.trim();
      const email = login.includes("@") ? login : await resolveLoginEmail(login);
      if (!email) throw new Error("Usuário ou senha inválidos.");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (signInError) throw new Error("Usuário ou senha inválidos.");
      const { profile } = await getCurrentUserProfile();
      if (!profile) throw new Error("Não foi possível localizar o perfil do usuário.");
      navigate({ to: isSharedSectorProfile(profile) ? "/admin/selecionar-solicitante" : "/admin" });
    } catch (err) {
      await supabase.auth.signOut();
      setError(err instanceof Error ? err.message : "Usuário ou senha inválidos.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef0f5] px-4">
        <div className="flex flex-col items-center gap-2 text-[#3474dd]" style={{ fontFamily: "Arial, sans-serif" }}>
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-xs text-slate-500">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef0f5] px-4 py-8 text-slate-900" style={{ fontFamily: "Arial, sans-serif" }}>
      <main className="w-full max-w-[340px] border border-slate-300 bg-white px-3 py-4 shadow-sm">
        <div className="mb-3 text-center">
          <div className="mb-1 flex items-center justify-center gap-1 text-[#3474dd]">
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[#3474dd] text-[11px] font-bold text-white">A</span>
            <span className="text-[15px] font-normal text-slate-600">Almoxarifado</span>
          </div>
          <p className="text-[10px] text-slate-500">Prefeitura Municipal de Pereiro</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor="usuario" className="text-[11px] font-normal text-slate-600">Usuário</Label>
            <Input
              id="usuario"
              type="text"
              autoComplete="username"
              placeholder="Usuário"
              className="h-8 rounded-sm border-slate-300 bg-white px-2 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-[#3474dd]"
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="senha" className="text-[11px] font-normal text-slate-600">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="Senha"
              className="h-8 rounded-sm border-slate-300 bg-white px-2 text-xs text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-[#3474dd]"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-center text-[10px] text-red-700">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || !usuario.trim() || !senha}
            className="ml-auto h-8 w-[92px] rounded-sm bg-[#3474dd] px-3 text-xs font-normal text-white hover:bg-[#2862c7]"
          >
            {submitting ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}
            Acessar
          </Button>
        </form>
      </main>
    </div>
  );
}
