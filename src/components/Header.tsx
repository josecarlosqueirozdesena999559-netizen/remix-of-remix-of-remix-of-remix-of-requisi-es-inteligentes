import React, { useState } from "react";
import {
  Search,
  Bell,
  HelpCircle,
  ChevronDown,
  Calendar,
  User,
  Check,
  X,
  Menu,
  Database,
  LogIn,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { SystemNotification, ActiveTab } from "../types";
import { UserProfile } from "../lib/supabaseService";

interface HeaderProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  onToggleSidebar: () => void;
  notifications: SystemNotification[];
  unreadNotificationsCount: number;
  onMarkAllNotificationsAsRead: () => void;
  onNotificationClick: (id: string, linkTab?: ActiveTab) => void;
  currentUser?: UserProfile | null;
  onOpenAuthModal?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchTerm,
  setSearchTerm,
  selectedDate,
  setSelectedDate,
  onToggleSidebar,
  notifications,
  unreadNotificationsCount,
  onMarkAllNotificationsAsRead,
  onNotificationClick,
  currentUser,
  onOpenAuthModal,
  onLogout,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const today = new Date();
  const currentMonth = today.toLocaleDateString("pt-BR", { month: "long" });
  const currentYear = today.getFullYear();
  const dateOptions = [
    today.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    `Este Mês (${currentMonth})`,
    "Últimos 30 Dias",
    `Ano ${currentYear}`,
  ];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200">
      {/* Left: Hamburger Toggle & Search Bar */}
      <div className="flex items-center space-x-4 flex-1 max-w-xl">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none"
          title="Alternar menu lateral"
          id="toggle-sidebar-btn"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar contratos, credores, notas..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700 placeholder-slate-400"
            id="search-input"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Date Picker, Notifications, Help & Profile */}
      <div className="flex items-center space-x-3">
        {/* Date Filter Selector */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            id="date-filter-btn"
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            <span>{selectedDate}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showDatePicker && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-40 text-xs">
              {dateOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setSelectedDate(option);
                    setShowDatePicker(false);
                  }}
                  className={`flex items-center justify-between w-full px-4 py-2 text-left hover:bg-emerald-50 hover:text-emerald-700 transition-colors ${
                    selectedDate === option
                      ? "font-medium text-emerald-600 bg-emerald-50/50"
                      : "text-slate-700"
                  }`}
                >
                  <span>{option}</span>
                  {selectedDate === option && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-500 rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none"
            id="notifications-btn"
            title="Notificações"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-white" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-40">
              <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                <h4 className="text-sm font-medium text-slate-800">Notificações Reais</h4>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  {unreadNotificationsCount} {unreadNotificationsCount === 1 ? "nova" : "novas"}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                {notifications.length > 0 ? (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        onNotificationClick(item.id, item.linkTab);
                        setShowNotifications(false);
                      }}
                      className={`p-3 hover:bg-slate-50 transition-colors cursor-pointer ${!item.read ? "bg-emerald-50/20 font-medium" : "opacity-80"}`}
                    >
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                          {!item.read && (
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                          )}
                          <span>{item.title}</span>
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0">{item.time}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Nenhuma notificação pendente no sistema.
                  </div>
                )}
              </div>
              {notifications.length > 0 && (
                <div className="p-2 border-t border-slate-100 text-center">
                  <button
                    onClick={() => {
                      onMarkAllNotificationsAsRead();
                    }}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    Marcar todas como lidas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Help Button */}
        <button
          className="p-2 text-slate-500 rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none"
          title="Ajuda e Suporte"
          id="help-btn"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* User Profile Avatar */}
        <div className="relative pl-2 border-l border-slate-200">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center space-x-2.5 focus:outline-none group cursor-pointer"
            id="user-profile-btn"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-medium flex items-center justify-center text-xs shadow-xs ring-2 ring-emerald-500/30">
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="text-left hidden sm:block">
              <span className="block text-xs font-medium text-slate-800 leading-tight">
                {currentUser ? currentUser.name : "Acessar Conta"}
              </span>
              <span className="block text-[10px] text-emerald-600 font-medium">
                {currentUser ? currentUser.role : "Entrar no Sistema"}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-40">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-800 truncate">
                  {currentUser ? currentUser.name : "Usuário"}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {currentUser?.email || "Acesso local"}
                </p>
                <span className="inline-block mt-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {currentUser?.role || "Administrador"}
                </span>
              </div>

              <div className="p-1 space-y-1">
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    if (onLogout) onLogout();
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-xs text-rose-700 hover:bg-rose-50 rounded-xl transition-colors text-left font-medium cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Sair (Ir para Tela Inicial)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
