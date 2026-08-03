import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileCheck2, Loader2, Lock, LogIn, User } from "lucide-react";
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: resolvedEmail, error: resolveError } = await (supabase as any).rpc(
          "resolve_login_email",
          { p_usuario: nomeLimpo },
        );

        if (resolveError) throw new Error(resolveError.message);
        email = typeof resolvedEmail === "string" ? resolvedEmail : "";
      }

      if (!email) throw new Error("Usuário ou senha incorretos.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) throw new Error("Usuário ou senha incorretos.");
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuário ou senha incorretos.");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="flex flex-col items-center gap-3 text-emerald-600">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Autenticando no sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12 relative overflow-hidden">
      {/* SUTIL DECORAÇÃO DE FUNDO EM BRANCO/VERDE */}
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-emerald-50/50 pointer-events-none blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-emerald-50/50 pointer-events-none blur-3xl" />

      <Card className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-100 z-10 relative">
        {/* CABEÇALHO DO BRANDING SIGEC */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30 mb-3">
            <FileCheck2 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-emerald-800">SOLICITE JÁ</h1>
          <p className="text-xs font-bold tracking-wider text-slate-400 uppercase mt-0.5">
            Gestão de Requisições
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="nome"
              className="text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Usuário
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="nome"
                type="text"
                autoComplete="username"
                placeholder="Informe seu usuário"
                className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="senha"
              className="text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Senha
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="Informe sua senha"
                className="h-11 rounded-xl border-slate-200 bg-slate-50 pl-10 font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
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
            className="h-11 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Entrar no Sistema
          </Button>
        </form>
      </Card>
    </div>
  );
}
