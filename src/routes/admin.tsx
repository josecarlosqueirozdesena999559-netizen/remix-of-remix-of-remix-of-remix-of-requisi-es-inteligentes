import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  FileClock,
  FilePlus,
  FileSignature,
  LayoutDashboard,
  Layers,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  MessagesSquare,
  Package,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdminSectionFromPath,
  hasAdminSectionAccess,
  isLimitedAdmin,
} from "@/lib/admin-sections";
import {
  BLOCK_NEW_REQUEST_MESSAGE,
  hasPendingRequestSignatures,
} from "@/lib/pending-request-signatures";
import {
  getCurrentUserProfile,
  isUserProfileIncomplete,
  type CurrentUserProfile,
} from "@/lib/user-profile";

const ALMOXARIFADO_WHATSAPP_NUMBER = "5588996374400";
const ALMOXARIFADO_WHATSAPP_MESSAGE =
  "Olá, gostaria de receber notificações sobre o acompanhamento das minhas requisições e entregas do almoxarifado.";
const ALMOXARIFADO_WHATSAPP_LINK = `https://wa.me/${ALMOXARIFADO_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  ALMOXARIFADO_WHATSAPP_MESSAGE,
)}`;

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [openCadastros, setOpenCadastros] = useState(pathname.startsWith("/admin/cadastros"));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [whatsappReminderOpen, setWhatsappReminderOpen] = useState(false);
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);
  const [createRequestError, setCreateRequestError] = useState<string | null>(null);
  const [checkingCreateRequest, setCheckingCreateRequest] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin/cadastros")) setOpenCadastros(true);
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
    setCreateRequestError(null);
  }, [pathname]);

  useEffect(() => {
    let active = true;

    async function checkProfile() {
      if (pathname === "/admin/completar-cadastro") return;

      try {
        const { user, profile } = await getCurrentUserProfile();

        if (!active) return;

        if (!user) {
          navigate({ to: "/" });
          return;
        }

        setProfile(profile);
        setWhatsapp(profile?.whatsapp ?? "");

        if (isUserProfileIncomplete(profile)) {
          navigate({ to: "/admin/completar-cadastro" });
        }
      } catch {
        if (active) navigate({ to: "/" });
      }
    }

    checkProfile();

    return () => {
      active = false;
    };
  }, [navigate, pathname]);

  useEffect(() => {
    if (!profile?.is_admin) return;

    const section = getAdminSectionFromPath(pathname);
    if (!section) return;
    if (hasAdminSectionAccess(profile, section)) return;

    navigate({ to: "/admin" });
  }, [navigate, pathname, profile]);

  const navItemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs transition-all duration-150 ${
      active
        ? "bg-emerald-50 font-bold text-emerald-700 shadow-2xs"
        : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    }`;
  const navIconClass = (active: boolean) =>
    `h-4 w-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`;
  const sectionTitleClass = "px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400";
  const isActivePath = (to: string, exact = false) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  const isAdmin = profile?.is_admin !== false;
  const limitedAdmin = isLimitedAdmin(profile);
  const showWhatsAppQrNotice = Boolean(profile?.id) && !profile?.is_admin;
  const mustRegisterWhatsApp =
    Boolean(profile?.id) &&
    !profile?.is_admin &&
    !profile?.whatsapp?.trim() &&
    pathname !== "/admin/completar-cadastro";

  const openWhatsAppActivationReminder = async () => {
    try {
      const qrCode = await QRCode.toDataURL(ALMOXARIFADO_WHATSAPP_LINK, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220,
      });
      setWhatsappQrCode(qrCode);
    } catch {
      setWhatsappQrCode(null);
    } finally {
      setWhatsappReminderOpen(true);
    }
  };

  const handleSaveWhatsApp = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!profile?.id) return;

    const digits = whatsapp.replace(/\D/g, "");
    const normalized = digits.startsWith("55") ? digits : `55${digits}`;

    if (normalized.length < 12 || normalized.length > 13) {
      setWhatsappError("Informe um WhatsApp válido.");
      return;
    }

    setSavingWhatsApp(true);
    setWhatsappError(null);
    setWhatsappNotice(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

      const { data: result, error: saveError } = await supabase.functions.invoke(
        "save-user-whatsapp",
        {
          body: {
            profileId: profile.id,
            whatsapp: normalized,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (saveError) throw new Error(saveError.message);
      if (!result?.ok) {
        throw new Error(result?.error || "Erro ao salvar WhatsApp. Tente novamente.");
      }

      const savedWhatsApp = result.whatsapp || normalized;
      setProfile((current) => (current ? { ...current, whatsapp: savedWhatsApp } : current));
      setWhatsapp(savedWhatsApp);
      setWhatsappNotice(
        result.welcomeError
          ? "WhatsApp salvo, mas a mensagem de boas-vindas não foi entregue agora."
          : "WhatsApp salvo com sucesso.",
      );
    } catch (err) {
      setWhatsappError(
        err instanceof Error ? err.message : "Erro ao salvar WhatsApp. Tente novamente.",
      );
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const handleCreateRequestClick = async () => {
    if (!profile) {
      setCreateRequestError("Não foi possível validar suas assinaturas pendentes.");
      return;
    }

    setCheckingCreateRequest(true);
    setCreateRequestError(null);

    try {
      const hasPendingSignatures = await hasPendingRequestSignatures(profile);

      if (hasPendingSignatures) {
        setCreateRequestError(BLOCK_NEW_REQUEST_MESSAGE);
        return;
      }

      navigate({ to: "/admin/requisicao" });
    } catch (error) {
      setCreateRequestError(
        error instanceof Error ? error.message : "Erro ao verificar assinaturas pendentes.",
      );
    } finally {
      setCheckingCreateRequest(false);
    }
  };

  const renderNavigation = (mobile = false) => {
    const inicioActive = isActivePath("/admin", true);
    const requisicaoActive = isActivePath("/admin/requisicao");
    const configuracoesActive = isActivePath("/admin/configuracoes");

    return (
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-2 ${mobile ? "mt-4" : ""}`}>
        <div className="space-y-5 px-3">
          <div className="space-y-1">
            <Link
              to="/admin"
              activeOptions={{ exact: true }}
              className={navItemClass(inicioActive)}
            >
              <LayoutDashboard className={navIconClass(inicioActive)} />
              <span className="truncate">Início / Dashboard</span>
            </Link>
          </div>

          {isAdmin ? (
            <>
              <div className="space-y-2">
                <p className={sectionTitleClass}>Gestão</p>
                <div className="space-y-1">
                  {hasAdminSectionAccess(profile, "solicitacoes") ? (
                    <Link
                      to="/admin/solicitacoes"
                      className={navItemClass(isActivePath("/admin/solicitacoes"))}
                    >
                      <ClipboardList
                        className={navIconClass(isActivePath("/admin/solicitacoes"))}
                      />
                      <span className="truncate">Solicitações Pendentes</span>
                    </Link>
                  ) : null}
                  {hasAdminSectionAccess(profile, "assinadas") ? (
                    <Link
                      to="/admin/assinadas"
                      className={navItemClass(isActivePath("/admin/assinadas"))}
                    >
                      <FileCheck2 className={navIconClass(isActivePath("/admin/assinadas"))} />
                      <span className="truncate">Assinadas</span>
                    </Link>
                  ) : null}
                  {hasAdminSectionAccess(profile, "backup") ? (
                    <Link
                      to="/admin/backup"
                      className={navItemClass(isActivePath("/admin/backup"))}
                    >
                      <Archive className={navIconClass(isActivePath("/admin/backup"))} />
                      <span className="truncate">Backup</span>
                    </Link>
                  ) : null}
                  {hasAdminSectionAccess(profile, "controle_assinaturas") ? (
                    <Link
                      to="/admin/controle-assinaturas"
                      className={navItemClass(isActivePath("/admin/controle-assinaturas"))}
                    >
                      <ShieldCheck
                        className={navIconClass(isActivePath("/admin/controle-assinaturas"))}
                      />
                      <span className="truncate">Controle de Assinaturas</span>
                    </Link>
                  ) : null}
                  {hasAdminSectionAccess(profile, "conversas") ? (
                    <Link
                      to="/admin/conversas"
                      className={navItemClass(isActivePath("/admin/conversas"))}
                    >
                      <MessagesSquare className={navIconClass(isActivePath("/admin/conversas"))} />
                      <span className="truncate">Conversas</span>
                    </Link>
                  ) : null}
                  {hasAdminSectionAccess(profile, "whatsapp_usuarios") ? (
                    <Link
                      to="/admin/whatsapp-usuarios"
                      className={navItemClass(isActivePath("/admin/whatsapp-usuarios"))}
                    >
                      <MessageCircle
                        className={navIconClass(isActivePath("/admin/whatsapp-usuarios"))}
                      />
                      <span className="truncate">Janelas WhatsApp</span>
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <p className={sectionTitleClass}>Requisições</p>
                <div className="space-y-1">
                  {hasAdminSectionAccess(profile, "requisicao") ? (
                    <Link
                      to="/admin/requisicao"
                      className={navItemClass(requisicaoActive)}
                      onClick={(event) => {
                        event.preventDefault();
                        void handleCreateRequestClick();
                      }}
                    >
                      <FilePlus className={navIconClass(requisicaoActive)} />
                      <span className="truncate">Criar Requisição</span>
                      {checkingCreateRequest ? (
                        <Loader2 className="ml-auto h-4 w-4 animate-spin text-emerald-600" />
                      ) : null}
                    </Link>
                  ) : null}
                  <Link
                    to="/admin/minhas-assinaturas"
                    className={navItemClass(isActivePath("/admin/minhas-assinaturas"))}
                  >
                    <FileClock
                      className={navIconClass(isActivePath("/admin/minhas-assinaturas"))}
                    />
                    <span className="truncate">Minhas Assinaturas</span>
                  </Link>
                  <Link
                    to="/admin/minhas-requisicoes"
                    className={navItemClass(isActivePath("/admin/minhas-requisicoes"))}
                  >
                    <ClipboardList
                      className={navIconClass(isActivePath("/admin/minhas-requisicoes"))}
                    />
                    <span className="truncate">Minhas Requisições</span>
                  </Link>
                  <Link
                    to="/admin/meus-assinados"
                    className={navItemClass(isActivePath("/admin/meus-assinados"))}
                  >
                    <FileCheck2 className={navIconClass(isActivePath("/admin/meus-assinados"))} />
                    <span className="truncate">Documentos Assinados</span>
                  </Link>
                </div>
              </div>

              {hasAdminSectionAccess(profile, "cadastros") ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOpenCadastros((value) => !value)}
                    className={`${navItemClass(pathname.startsWith("/admin/cadastros"))} justify-between`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Layers className={navIconClass(pathname.startsWith("/admin/cadastros"))} />
                      <span className="truncate">Cadastros</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                        openCadastros ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                  <div
                    className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
                      openCadastros ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="ml-4 space-y-1 border-l border-slate-200 pl-2 pt-1">
                        <Link
                          to="/admin/cadastros/usuarios"
                          className={navItemClass(isActivePath("/admin/cadastros/usuarios"))}
                        >
                          <Users
                            className={navIconClass(isActivePath("/admin/cadastros/usuarios"))}
                          />
                          <span className="truncate">Usuários</span>
                        </Link>
                        <Link
                          to="/admin/cadastros/produtos"
                          className={navItemClass(isActivePath("/admin/cadastros/produtos"))}
                        >
                          <Package
                            className={navIconClass(isActivePath("/admin/cadastros/produtos"))}
                          />
                          <span className="truncate">Produtos</span>
                        </Link>
                        <Link
                          to="/admin/cadastros/programas"
                          className={navItemClass(isActivePath("/admin/cadastros/programas"))}
                        >
                          <FileSignature
                            className={navIconClass(isActivePath("/admin/cadastros/programas"))}
                          />
                          <span className="truncate">Programas</span>
                        </Link>
                        <Link
                          to="/admin/cadastros/locais"
                          className={navItemClass(isActivePath("/admin/cadastros/locais"))}
                        >
                          <MapPin
                            className={navIconClass(isActivePath("/admin/cadastros/locais"))}
                          />
                          <span className="truncate">Setores</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-2">
              <p className={sectionTitleClass}>Navegação</p>
              <div className="space-y-1">
                <Link
                  to="/admin/requisicao"
                  className={navItemClass(requisicaoActive)}
                  onClick={(event) => {
                    event.preventDefault();
                    void handleCreateRequestClick();
                  }}
                >
                  <FilePlus className={navIconClass(requisicaoActive)} />
                  <span className="truncate">Criar Requisição</span>
                  {checkingCreateRequest ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin text-emerald-600" />
                  ) : null}
                </Link>
                <Link
                  to="/admin/minhas-assinaturas"
                  className={navItemClass(isActivePath("/admin/minhas-assinaturas"))}
                >
                  <FileClock className={navIconClass(isActivePath("/admin/minhas-assinaturas"))} />
                  <span className="truncate">Minhas Assinaturas</span>
                </Link>
                <Link
                  to="/admin/minhas-requisicoes"
                  className={navItemClass(isActivePath("/admin/minhas-requisicoes"))}
                >
                  <ClipboardList
                    className={navIconClass(isActivePath("/admin/minhas-requisicoes"))}
                  />
                  <span className="truncate">Minhas Requisições</span>
                </Link>
                <Link
                  to="/admin/meus-assinados"
                  className={navItemClass(isActivePath("/admin/meus-assinados"))}
                >
                  <FileCheck2 className={navIconClass(isActivePath("/admin/meus-assinados"))} />
                  <span className="truncate">Documentos Assinados</span>
                </Link>
              </div>
            </div>
          )}

          {!isAdmin || !limitedAdmin || hasAdminSectionAccess(profile, "configuracoes") ? (
            <div className="space-y-2">
              <p className={sectionTitleClass}>Configurações</p>
              <div className="space-y-1">
                <Link to="/admin/configuracoes" className={navItemClass(configuracoesActive)}>
                  <Settings className={navIconClass(configuracoesActive)} />
                  <span className="truncate">Configurações</span>
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* HEADER SUPERIOR */}
      <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
        {/* Left: Hamburger Toggle & Search Bar */}
        <div className="flex items-center space-x-4 flex-1 max-w-xl">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex p-2 text-slate-500 rounded-lg hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none cursor-pointer"
            title="Alternar menu lateral"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="md:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="Abrir menu">
                  <Menu className="h-5 w-5 text-slate-700" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-xs bg-white p-0">
                <SheetHeader className="p-4 border-b border-slate-200">
                  <SheetTitle className="text-left text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-emerald-600" />
                    SOLICITE JÁ
                  </SheetTitle>
                </SheetHeader>
                {renderNavigation(true)}
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Right: User Profile Avatar, WhatsApp Contact & Sair Button */}
        <div className="flex items-center space-x-3">
          {showWhatsAppQrNotice && (
            <button
              type="button"
              onClick={() => void openWhatsAppActivationReminder()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold transition-all cursor-pointer border border-emerald-200/80 shadow-2xs"
              title="Contato do Almoxarifado"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Contato Almoxarifado</span>
            </button>
          )}

          <div className="relative hidden sm:flex items-center space-x-2 bg-slate-100 rounded-full px-3.5 py-1.5 text-xs text-slate-700">
            <div className="w-6 h-6 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center text-[11px] shadow-xs">
              {profile?.nome ? profile.nome.charAt(0).toUpperCase() : "A"}
            </div>
            <span className="font-semibold">{profile?.nome || "Usuário"}</span>
            {profile?.is_admin && (
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                Admin
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Sair do sistema"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* SIDEBAR & MAIN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`hidden md:flex flex-col bg-white border-r border-slate-200/95 justify-between transition-all duration-300 z-20 shadow-xs ${
            collapsed ? "w-20" : "w-64"
          }`}
        >
          <div className="overflow-y-auto overflow-x-hidden flex-1 py-4">
            {/* Brand Header */}
            <div className="px-5 mb-6 flex items-center justify-between">
              <Link to="/admin" className="flex items-center space-x-3 cursor-pointer">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                {!collapsed && (
                  <div className="flex flex-col">
                    <span className="text-lg font-extrabold tracking-tight text-emerald-800 leading-none">
                      SOLICITE JÁ
                    </span>
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mt-1">
                      Gestão de Requisições
                    </span>
                  </div>
                )}
              </Link>
            </div>

            {renderNavigation(false)}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* POPUP COMPACTO DE ASSINATURAS PENDENTES */}
      <Dialog
        open={Boolean(createRequestError)}
        onOpenChange={(open) => {
          if (!open) setCreateRequestError(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-base font-bold text-slate-800">
              Assinaturas Pendentes
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              {createRequestError}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => setCreateRequestError(null)}
            >
              Fechar
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-md shadow-emerald-600/20"
              onClick={() => {
                setCreateRequestError(null);
                navigate({
                  to: profile?.is_admin ? "/admin/solicitacoes" : "/admin/minhas-assinaturas",
                });
              }}
            >
              Ver Assinaturas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whatsappReminderOpen} onOpenChange={setWhatsappReminderOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Fale com o almoxarifado pelo WhatsApp</DialogTitle>
            <DialogDescription>
              Aponte a câmera para o QR Code ou abra o link abaixo para enviar a mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            <div className="flex size-56 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
              {whatsappQrCode ? (
                <img
                  src={whatsappQrCode}
                  alt="QR Code para abrir o WhatsApp do almoxarifado"
                  className="size-full"
                />
              ) : (
                <QrCode className="h-16 w-16 text-slate-400" />
              )}
            </div>
            <p className="text-center text-sm text-slate-600">
              Número do almoxarifado:{" "}
              <strong className="text-slate-800">{ALMOXARIFADO_WHATSAPP_NUMBER}</strong>
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="gap-2 rounded-xl" asChild>
              <a href={ALMOXARIFADO_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            </Button>
            <Button
              type="button"
              className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={() => setWhatsappReminderOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mustRegisterWhatsApp} onOpenChange={() => {}}>
        <DialogContent className="[&>button]:hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle>Informe seu WhatsApp</DialogTitle>
            <DialogDescription>
              Você receberá notificações sobre pendências e pedidos separados para retirada.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSaveWhatsApp}>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                inputMode="numeric"
                autoComplete="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                disabled={savingWhatsApp}
                required
              />
            </div>

            {whatsappError && <p className="text-sm text-destructive">{whatsappError}</p>}
            {whatsappNotice && <p className="text-sm text-muted-foreground">{whatsappNotice}</p>}

            <Button type="submit" className="w-full gap-2 rounded-xl" disabled={savingWhatsApp}>
              {savingWhatsApp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Confirmar WhatsApp
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
