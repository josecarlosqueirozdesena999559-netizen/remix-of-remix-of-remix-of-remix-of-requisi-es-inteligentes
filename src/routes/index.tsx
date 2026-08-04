import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole, Warehouse } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const nomeLimpo = nome.trim();
      const isAdminLogin = nomeLimpo.toLowerCase() === "admin";
      let email = "";

      if (isAdminLogin) {
        email = "admin@pereiro.ce.gov.br";
      } else {
        const { data: resolvedEmail, error: resolveError } = await (supabase as any).rpc(
          "resolve_login_email",
          { p_usuario: nomeLimpo },
        );

        if (resolveError) throw new Error(resolveError.message);
        email = typeof resolvedEmail === "string" ? resolvedEmail : "";
      }

      if (!email) throw new Error("Usuário ou senha");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) throw new Error("Usuário ou senha");
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuário ou senha");
      setLoading(false);
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
      <div className="absolute inset-x-0 top-0 h-48 bg-emerald-700" />
      <div className="absolute inset-x-0 top-48 h-px bg-emerald-900/10" />
      <Card className="relative w-full max-w-sm rounded-lg border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/10">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
            <Warehouse className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-normal text-slate-950">Almoxarifado</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse o painel de requisições</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome" className="text-slate-700">
              Usuário
            </Label>
            <Input
              id="nome"
              type="text"
              autoComplete="username"
              placeholder="Usuário"
              className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="text-slate-700">
              Senha
            </Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="Senha"
              className="h-11 border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-600"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-center text-xs text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="h-11 w-full gap-2 bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <LockKeyhole className="h-4 w-4" />
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
