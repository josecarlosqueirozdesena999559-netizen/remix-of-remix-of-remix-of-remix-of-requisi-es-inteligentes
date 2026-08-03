import React, { useState } from "react";
import { LogIn, Lock, Mail, UserPlus, User, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { UserProfile } from "../lib/supabaseService";

interface WelcomeScreenProps {
  onEnterSystem: (user: UserProfile) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onEnterSystem }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"Administrador" | "Fiscal" | "Gestor" | "Auditor">(
    "Administrador",
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        const userProf: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          name: profile?.name || data.user.user_metadata?.name || email.split("@")[0],
          role: profile?.role || "Administrador",
        };

        onEnterSystem(userProf);
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setErrorMessage(err.message || "Falha ao realizar login. Verifique seu e-mail e senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || email.split("@")[0],
            role,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create or update profile record in database
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email,
          name: name || email.split("@")[0],
          role,
        });

        const userProf: UserProfile = {
          id: data.user.id,
          email,
          name: name || email.split("@")[0],
          role,
        };

        setSuccessMessage("Conta criada com sucesso no Supabase!");
        setTimeout(() => {
          onEnterSystem(userProf);
        }, 1000);
      }
    } catch (err: any) {
      console.error("Register error:", err);
      setErrorMessage(err.message || "Falha ao criar usuário no Supabase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col items-center justify-center p-6 selection:bg-emerald-600 selection:text-white">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* System Name */}
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-wider text-emerald-700">SIGEC</h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Sistema Integrado de Gestão de Contratos
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-left space-y-5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMessage("");
                setSuccessMessage("");
              }}
              className={`py-2 rounded-lg transition-all cursor-pointer ${
                mode === "register"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Criar Conta
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium leading-relaxed">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
              {successMessage}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Login / E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@orgao.sp.gov.br"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? "Entrando..." : "Entrar"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="novo.usuario@orgao.sp.gov.br"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••• (mínimo 6 caracteres)"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Perfil de Acesso
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <select
                    value={role}
                    onChange={(e: any) => setRole(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all appearance-none cursor-pointer"
                  >
                    <option value="Administrador">Administrador</option>
                    <option value="Gestor">Gestor de Contrato</option>
                    <option value="Fiscal">Fiscal de Contrato</option>
                    <option value="Auditor">Auditor / Controle</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? "Cadastrando..." : "Criar Usuário"}</span>
              </button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-slate-400 font-medium">
          SIGEC © {new Date().getFullYear()} — Todos os direitos reservados
        </p>
      </div>
    </div>
  );
};
