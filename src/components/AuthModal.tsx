import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { SUPABASE_SQL_SCHEMA, UserProfile } from "../lib/supabaseService";
import {
  ShieldCheck,
  LogIn,
  UserPlus,
  Database,
  Copy,
  Check,
  Lock,
  Mail,
  User,
  Server,
  AlertCircle,
  X,
} from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLoginSuccess: (user: UserProfile) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<"login" | "register" | "sql">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"Administrador" | "Fiscal" | "Gestor" | "Auditor">(
    "Administrador",
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);

  if (!isOpen) return null;

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

      if (error) {
        throw error;
      }

      if (data.user) {
        // Fetch profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.user.id)
          .single();

        const userProfile: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          name: profile?.name || data.user.user_metadata?.name || email.split("@")[0],
          role: profile?.role || "Administrador",
        };

        onLoginSuccess(userProfile);
        setSuccessMessage("Login realizado com sucesso no Supabase!");
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setErrorMessage(
        err.message ||
          "Erro ao efetuar login. Verifique se o usuário já foi cadastrado no Supabase.",
      );
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
            name,
            role,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Try creating profile row
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email,
          name,
          role,
        });

        const userProfile: UserProfile = {
          id: data.user.id,
          email,
          name,
          role,
        };

        onLoginSuccess(userProfile);
        setSuccessMessage("Conta cadastrada com sucesso! Sessão iniciada.");
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      console.error("Register error:", err);
      setErrorMessage(err.message || "Erro ao registrar usuário no Supabase.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium tracking-tight">
                SIGEC — Autenticação & Banco Supabase
              </h2>
              <p className="text-[11px] text-slate-400">
                Conectado:{" "}
                <span className="font-mono text-emerald-400">mbqjxajmnmeiuvcwzdhg.supabase.co</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2">
          <button
            onClick={() => setActiveTab("login")}
            className={`px-4 py-2.5 text-xs font-medium rounded-t-lg transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "login"
                ? "bg-white text-emerald-700 border-x border-t border-slate-200 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Acessar Conta</span>
          </button>
          <button
            onClick={() => setActiveTab("register")}
            className={`px-4 py-2.5 text-xs font-medium rounded-t-lg transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "register"
                ? "bg-white text-emerald-700 border-x border-t border-slate-200 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Criar Conta</span>
          </button>
          <button
            onClick={() => setActiveTab("sql")}
            className={`px-4 py-2.5 text-xs font-medium rounded-t-lg transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "sql"
                ? "bg-white text-emerald-700 border-x border-t border-slate-200 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Tabelas / SQL</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center space-x-2 font-medium">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current User Status */}
          {currentUser && (
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-medium flex items-center justify-center text-xs">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {currentUser.email} • {currentUser.role}
                  </p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
              >
                Sair
              </button>
            </div>
          )}

          {/* TAB 1: LOGIN */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  E-mail Corporativo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@orgao.sp.gov.br"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Senha de Acesso
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? "Acessando Supabase..." : "Entrar via Supabase Auth"}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: REGISTER */}
          {activeTab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Ana Maria Silva"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  E-mail Corporativo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ana.silva@orgao.sp.gov.br"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Perfil de Acesso
                </label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  <option value="Administrador">Administrador de Contratos</option>
                  <option value="Fiscal">Fiscal de Contrato</option>
                  <option value="Gestor">Gestor de Finanças / Pagamentos</option>
                  <option value="Auditor">Auditor Interno / Controle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Senha (Mínimo 6 caracteres)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {loading ? "Cadastrando no Supabase..." : "Cadastrar Conta no Supabase"}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: SQL SCHEMA */}
          {activeTab === "sql" && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-slate-800 flex items-center space-x-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Script de Criação das Tabelas de Login e Dados</span>
                  </h4>
                  <button
                    onClick={handleCopySql}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-medium rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    {copiedSql ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? "Copiado!" : "Copiar SQL"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Execute este script no <strong>SQL Editor</strong> do seu painel Supabase para
                  criar a tabela de <code>profiles</code> e suporte a logins.
                </p>
              </div>

              <div className="relative bg-slate-950 text-slate-200 rounded-xl p-3 text-[11px] font-mono overflow-x-auto max-h-56 border border-slate-800">
                <pre>{SUPABASE_SQL_SCHEMA}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
