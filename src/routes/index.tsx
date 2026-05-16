import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LockKeyhole, Loader2, Mail, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (signInError) throw new Error("Usuário ou senha inválido");
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuário ou senha inválido");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200 px-4">
        <div className="flex flex-col items-center gap-3 text-primary">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef2f7_0%,#dfe7ef_52%,#f8fafc_100%)] px-4 py-8">
      <Card className="w-full max-w-[420px] rounded-lg border-slate-300/80 bg-white/95 p-8 shadow-xl shadow-slate-400/20">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Warehouse className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-normal text-primary">Acesso ao Sistema</h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
            Entre para acompanhar requisições, estoque e movimentações do almoxarifado.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-normal text-slate-700">
              E-mail
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Informe seu e-mail"
                className="h-12 rounded-md border-slate-300 bg-slate-50 pl-10 font-normal focus-visible:ring-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="font-normal text-slate-700">
              Senha
            </Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="Informe sua senha"
                className="h-12 rounded-md border-slate-300 bg-slate-50 pl-10 font-normal focus-visible:ring-primary"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-12 w-full rounded-md text-base font-normal">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
