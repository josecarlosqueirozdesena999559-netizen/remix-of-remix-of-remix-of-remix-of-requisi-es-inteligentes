import React, { useState } from "react";
import { Settings, User, Lock, Bell, Check } from "lucide-react";

export const SettingsView: React.FC = () => {
  const [systemName, setSystemName] = useState("SIGEC - Sistema Integrado de Gestão de Contratos");
  const [notifyDays, setNotifyDays] = useState("30");
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-medium text-slate-800">Configurações do Sistema</h2>
        <p className="text-xs text-slate-500 mt-1">
          Parâmetros gerais de notificação, perfil e preferências do sistema SIGEC
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5"
      >
        <div>
          <h3 className="text-sm font-medium text-slate-800 flex items-center space-x-2 pb-3 border-b border-slate-100">
            <User className="w-4 h-4 text-emerald-600" />
            <span>Perfil Administrativo</span>
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nome do Usuário
              </label>
              <input
                type="text"
                defaultValue="Administrador FiscalPro"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                E-mail Institucional
              </label>
              <input
                type="email"
                defaultValue="admin@fiscalpro.com.br"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-800 flex items-center space-x-2 pb-3 border-b border-slate-100">
            <Bell className="w-4 h-4 text-emerald-600" />
            <span>Alertas e Regras de Vencimento</span>
          </h3>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Antecedência de Alerta de Vencimento (Dias)
              </label>
              <select
                value={notifyDays}
                onChange={(e) => setNotifyDays(e.target.value)}
                className="w-full max-w-xs px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="15">15 Dias Antes</option>
                <option value="30">30 Dias Antes (Padrão)</option>
                <option value="60">60 Dias Antes</option>
                <option value="90">90 Dias Antes</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          {saved && (
            <span className="text-xs font-medium text-emerald-600 flex items-center space-x-1">
              <Check className="w-4 h-4" />
              <span>Configurações salvas com sucesso!</span>
            </span>
          )}
          <button
            type="submit"
            className="ml-auto px-5 py-2.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
};
