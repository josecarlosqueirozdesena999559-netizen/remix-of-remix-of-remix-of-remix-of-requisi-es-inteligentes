import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Eye, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
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

const REMEMBER_LOGIN_KEY = "almoxarifado.rememberedLogin";

function Index() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [rememberAccess, setRememberAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedLogin = window.localStorage.getItem(REMEMBER_LOGIN_KEY);

    if (savedLogin) {
      setNome(savedLogin);
      setRememberAccess(true);
    }
  }, []);

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

      if (rememberAccess) {
        window.localStorage.setItem(REMEMBER_LOGIN_KEY, nomeLimpo);
      } else {
        window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }

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
    <main className="grid min-h-screen min-h-dvh w-screen overflow-hidden bg-white text-slate-900 md:grid-cols-[55%_45%]">
      <section
        className="relative hidden min-h-screen bg-cover bg-center bg-no-repeat md:block"
        style={{ backgroundImage: "url('/login-warehouse.png')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/20 via-transparent to-emerald-950/20" />
        <div className="relative z-10 px-16 pt-28 text-white lg:px-24 lg:pt-32">
          <h1 className="text-5xl font-bold tracking-tight drop-shadow-sm lg:text-6xl">Almoxarifado</h1>
          <p className="mt-4 text-xl text-emerald-50/90 drop-shadow-sm">Gestão de solicitações e estoque</p>
        </div>
      </section>

      <section className="flex min-h-screen min-h-dvh items-center justify-center bg-[#f8faf9] px-6 py-10 sm:px-10 lg:px-16">
        <Card className="w-full max-w-[430px] rounded-xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10 sm:p-10">
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
                  className="h-12 rounded-md border-slate-200 bg-white pl-11 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-emerald-600"
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
                  className="h-12 rounded-md border-slate-200 bg-white px-11 text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-emerald-600"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
                <Eye className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={rememberAccess}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRememberAccess(checked);

                  if (!checked) {
                    window.localStorage.removeItem(REMEMBER_LOGIN_KEY);
                  }
                }}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  rememberAccess ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-transparent"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
              Lembrar acesso
            </label>

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
      </section>
    </main>
  );
}