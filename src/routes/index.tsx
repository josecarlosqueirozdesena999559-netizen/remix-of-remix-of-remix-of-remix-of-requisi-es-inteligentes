import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
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
        const query = supabase.from("usuarios").select("email").limit(2);

        const { data: users, error: loginError } = await query.ilike("nome", nomeLimpo);

        if (loginError) throw new Error(loginError.message);
        if (!users?.length) throw new Error("Usuário ou senha inválido");
        if (users.length > 1) {
          throw new Error(
            "Existe mais de um usuário com este nome. Peça ao admin para ajustar o cadastro.",
          );
        }

        email = users[0]?.email || "";
      }
      if (!email) throw new Error("Usuário ou senha inválido");

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
    <div className="flex min-h-screen items-center justify-center bg-slate-200 px-4 py-8">
      <Card className="w-full max-w-sm rounded-md border-slate-300 bg-white p-6 shadow-lg shadow-slate-400/30">
        <h1 className="mb-6 text-center text-xl font-normal text-primary">Acesso ao Sistema</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome" className="font-normal text-slate-700">
              Nome do usuário
            </Label>
            <Input
              id="nome"
              type="text"
              autoComplete="username"
              placeholder="Digite o nome cadastrado"
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
              placeholder="Informe sua senha"
              className="h-11 rounded-md border-slate-300 bg-slate-50 font-normal focus-visible:ring-primary"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive">
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
