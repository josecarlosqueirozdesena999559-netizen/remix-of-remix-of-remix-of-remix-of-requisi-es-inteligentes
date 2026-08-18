import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Eye, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearSelectedSharedRequesterId } from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";

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
      const normalizedLogin = nomeLimpo.toLowerCase();
      const isAdminLogin = normalizedLogin === "admin";
      const isEmailLogin = nomeLimpo.includes("@");
      let email = "";

      if (isAdminLogin) {
        email = "admin@pereiro.ce.gov.br";
      } else if (isEmailLogin) {
        email = nomeLimpo;
      } else {
        const { data: resolvedEmail, error: resolveError } = await (supabase as any).rpc(
          "resolve_login_email",
          { p_usuario: nomeLimpo },
        );

        if (resolveError) throw new Error(resolveError.message);
        email = typeof resolvedEmail === "string" ? resolvedEmail : "";
      }

      if (!email) throw new Error("Usuário ou senha inválidos");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });

      if (signInError) throw new Error("Usuário ou senha inválidos");
      const { profile } = await getCurrentUserProfile();

      if (isSharedSectorProfile(profile)) {
        clearSelectedSharedRequesterId();
        navigate({ to: "/admin/selecionar-solicitante" });
      } else if (profile?.is_admin) {
        navigate({ to: "/admin" });
      } else {
        await supabase.auth.signOut();
        throw new Error("Usuário ou senha inválidos");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuário ou senha inválidos");
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
    <main className="relative min-h-screen overflow-hidden bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.10),transparent_32%),radial-gradient(circle_at_18%_82%,rgba(5,150,105,0.12),transparent_34%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1240px] items-center justify-center">
        <section className="grid w-full overflow-hidden bg-white shadow-2xl shadow-slate-900/10 lg:min-h-[700px] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative hidden min-h-[700px] overflow-hidden bg-emerald-950 lg:block">
            <img
              src="/login-warehouse.png"
              alt="Ilustração do almoxarifado"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-transparent to-emerald-950/25" />
            <div className="relative z-10 px-16 pt-28 text-white">
              <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm">Almoxarifado</h1>
              <p className="mt-3 text-lg text-emerald-50/90 drop-shadow-sm">Gestão de solicitações e estoque</p>
            </div>
          </div>

          <div className="flex min-h-[700px] items-center justify-center bg-white px-6 py-10 sm:px-10 lg:px-14">
            <Card className="w-full max-w-[370px] rounded-xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10 sm:p-9">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold tracking-tight text-slate-950">Bem-vindo de volta</h2>
                <p className="mt-2 text-sm text-slate-500">Entre com seus dados para acessar o sistema</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-sm font-semibold text-slate-700">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="nome"
                      type="text"
                      autoComplete="username"
                      placeholder="seuemail@exemplo.com"
                      className="h-11 rounded-md border-slate-200 bg-white pl-11 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-emerald-600"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senha" className="text-sm font-semibold text-slate-700">
                    Senha
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <Input
                      id="senha"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-11 rounded-md border-slate-200 bg-white px-11 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-emerald-600"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      required
                    />
                    <Eye className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-slate-500">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-emerald-700 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    Lembrar acesso
                  </label>
                  <span className="font-medium text-emerald-700">Esqueci minha senha</span>
                </div>

                {error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-12 w-full gap-2 rounded-md bg-emerald-700 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800"
                >
                  <LockKeyhole className="h-4 w-4" />
                  Entrar
                </Button>
              </form>

              <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-xs font-medium text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                Acesso seguro e restrito a usuários autorizados
              </div>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}