import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
      <div className="flex min-h-screen items-center justify-center bg-slate-200 px-4">
        <div className="flex flex-col items-center gap-3 text-primary">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-200 px-4 py-8">
      <Card className="w-full max-w-sm rounded-md border-slate-300 bg-white p-6 shadow-lg shadow-slate-400/30">
        <h1 className="mb-6 text-center text-xl font-normal text-primary">Acesso ao Sistema</h1>

        <Alert className="mb-6 border-slate-200 bg-slate-50 text-slate-900">
          <CircleAlert className="h-4 w-4 text-slate-900" />
          <AlertDescription className="space-y-1 text-sm leading-5 text-slate-900">
            <p>Entre com seu e-mail e senha para acessar o painel.</p>
            <p>
              O acesso é feito somente para usuários já cadastrados pela operação. Esta tela não
              possui fluxo de criação de conta e o usuário não consegue criar novas requisições.
            </p>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome" className="font-normal text-slate-700">
              Usuário
            </Label>
            <Input
              id="nome"
              type="text"
              autoComplete="username"
              placeholder="Usuário"
              className="h-11 rounded-md border-slate-300 bg-slate-50 font-normal focus-visible:ring-primary"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="font-normal text-slate-700">
              Senha
            </Label>
            <Input
              id="senha"
              type="password"
              autoComplete="current-password"
              placeholder="Senha"
              className="h-11 rounded-md border-slate-300 bg-slate-50 font-normal focus-visible:ring-primary"
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

          <Button type="submit" className="h-11 w-full rounded-md text-base font-normal">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}
