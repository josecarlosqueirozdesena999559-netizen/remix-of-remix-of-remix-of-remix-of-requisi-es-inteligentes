import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
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
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="flex flex-col items-center gap-3 text-emerald-700">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-slate-900">
      <main className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">Almoxarifado</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse com seu usuário e senha</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="usuario" className="text-slate-700">Usuário</Label>
            <Input
              id="usuario"
              type="text"
              autoComplete="username"
              placeholder="Digite seu usuário"
              className="h-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha" className="text-slate-700">Senha</Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              className="h-10 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-center text-xs text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={submitting || !usuario.trim() || !senha}
            className="h-10 w-full gap-2 bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            Entrar
          </Button>
        </form>
      </main>
    </div>
  );
}
