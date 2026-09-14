import React from "react";
import {
  LayoutDashboard,
  FilePlus,
  Users,
  Receipt,
  Banknote,
  BarChart3,
  BellRing,
  Bot,
  Settings,
  ShieldCheck,
  FileCheck2,
  FileText,
  UserCheck,
  ClipboardList,
  ChevronRight,
  X,
} from "lucide-react";
import { ActiveTab } from "../types";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  collapsed: boolean;
  onOpenSecurityModal: () => void;
  onToggleSidebar?: () => void;
  onShowWelcomeScreen?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  onOpenSecurityModal,
  onToggleSidebar,
}) => {
  const cadastrosItems = [
    { id: "lancar-contrato", label: "Lançar Contratos", icon: FilePlus },
    { id: "contratos-lancados", label: "Contratos Lançados", icon: FileText },
    { id: "fiscais", label: "Cadastrar Fiscais / Portarias", icon: UserCheck },
    { id: "credores", label: "Credores", icon: Users },
    { id: "empenhos", label: "Empenhos", icon: Banknote },
    { id: "notas", label: "Notas de Serviços", icon: Receipt },
  ];

  const gestaoItems = [
    { id: "controle-contratos", label: "Controle de Contratos", icon: ClipboardList },
    { id: "relatorios", label: "Relatórios", icon: BarChart3 },
    { id: "alertas", label: "Alertas", icon: BellRing },
    { id: "ia", label: "IA", icon: Bot },
  ];

  const configuracoesItems = [
    { id: "configuracoes", label: "Configurações", icon: Settings },
    {
      id: "seguranca",
      label: "Segurança & Auditoria",
      icon: ShieldCheck,
      action: onOpenSecurityModal,
    },
  ];

  return (
    <aside
      className={`bg-white border-r border-slate-200/95 flex flex-col justify-between transition-all duration-300 z-20 shadow-xs ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="overflow-y-auto overflow-x-hidden flex-1 py-4">
        {/* Brand Header */}
        <div className="px-5 mb-6 flex items-center justify-between">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => setActiveTab("dashboard")}
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-extrabold tracking-tight text-emerald-800 leading-none">
                  SIGEC
                </span>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-1">
                  Gestão de Contratos
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Direct Link */}
        <div className="px-3 mb-4">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all duration-150 cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/20"
                : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            }`}
            title={collapsed ? "Dashboard" : undefined}
          >
            <LayoutDashboard
              className={`w-4 h-4 shrink-0 ${activeTab === "dashboard" ? "text-white" : "text-slate-500"}`}
            />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </button>
        </div>

        {/* CADASTROS SECTION */}
        <div className="px-3 mb-4">
          {!collapsed && (
            <p className="px-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
              Cadastros
            </p>
          )}
          <div className="space-y-1">
            {cadastrosItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as ActiveTab)}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-bold shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* GESTÃO SECTION */}
        <div className="px-3 mb-4">
          {!collapsed && (
            <p className="px-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
              Gestão
            </p>
          )}
          <div className="space-y-1">
            {gestaoItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as ActiveTab)}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-bold shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* CONFIGURAÇÕES SECTION */}
        <div className="px-3 mb-4">
          {!collapsed && (
            <p className="px-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-2">
              Configurações
            </p>
          )}
          <div className="space-y-1">
            {configuracoesItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else {
                      setActiveTab(item.id as ActiveTab);
                    }
                  }}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-bold shadow-2xs"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"}`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/55 space-y-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
            title={collapsed ? "Expandir menu" : "Fechar menu"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <X className="w-4 h-4 text-rose-500" />
                <span>Fechar menu</span>
              </>
            )}
          </button>
        )}
      </div>
    </aside>
  );
};
