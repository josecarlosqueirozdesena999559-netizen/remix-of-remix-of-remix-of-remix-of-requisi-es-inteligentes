import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole, Smartphone, Warehouse } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearSelectedSharedRequesterId } from "@/lib/shared-sector-session";
import { enableUserAppMode } from "@/lib/user-app-mode";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/app")({
  component: UserAppLogin,
});

function UserAppLogin() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareApp() {
      enableUserAppMode();

      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (data.session) {
        navigate({ to: "/admin/requisicao", search: { app: "usuario" } });
        return;
      }

      setLoading(false);
    }

    void prepareApp();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const usuario = nome.trim();
      const email = usuario.includes("@") ? usuario : await resolveLoginEmail(usuario);

      if (!email) throw new Error("Usuario ou senha");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) throw new Error("Usuario ou senha");

      const { profile } = await getCurrentUserProfile();
      if (profile?.is_admin) {
        await supabase.auth.signOut();
        throw new Error("Este aplicativo e somente para usuarios solicitantes.");
      }

      enableUserAppMode();
      clearSelectedSharedRequesterId();
      navigate({ to: "/admin/requisicao", search: { app: "usuario" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuario ou senha");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-3 text-emerald-700">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 text-slate-900">
      <div className="absolute inset-x-0 top-0 h-52 bg-emerald-700" />
      <div className="absolute inset-x-0 top-52 h-px bg-emerald-900/10" />

      <Card className="relative w-full max-w-sm rounded-lg border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/10">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
            <Warehouse className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">Solicite Ja</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <Smartphone className="h-4 w-4" />
            App de requisicoes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-usuario" className="text-slate-700">
              Usuario
            </Label>
            <Input
              id="app-usuario"
              type="text"
              autoComplete="username"
              placeholder="Usuario"
              className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="app-senha" className="text-slate-700">
              Senha
            </Label>
            <Input
              id="app-senha"
              type="password"
              autoComplete="current-password"
              placeholder="Senha"
              className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              required
            />
          </div>

          {error ? (
            <p className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-center text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={submitting}
            className="h-11 w-full gap-2 bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LockKeyhole className="h-4 w-4" />
            )}
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}

async function resolveLoginEmail(usuario: string) {
  if (!usuario) return "";

  const { data, error } = await (supabase as any).rpc("resolve_login_email", {
    p_usuario: usuario,
  });

  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : "";
}