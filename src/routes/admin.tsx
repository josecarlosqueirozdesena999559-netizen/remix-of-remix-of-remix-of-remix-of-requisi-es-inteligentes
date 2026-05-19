import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, Loader2, QrCode, Send } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdminSectionFromPath,
  hasAdminSectionAccess,
  isLimitedAdmin,
} from "@/lib/admin-sections";
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
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [whatsappReminderOpen, setWhatsappReminderOpen] = useState(false);
  const [whatsappQrCode, setWhatsappQrCode] = useState<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin/cadastros")) setOpenCadastros(true);
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

  const itemCls =
    "block rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors";
  const activeCls = "bg-sidebar-accent text-sidebar-foreground";
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

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-64 flex-col bg-sidebar p-4 text-sidebar-foreground">
        <div className="mb-4 border-b border-sidebar-border px-3 py-4 text-xl">Almoxarifado</div>
        <nav className="flex-1 space-y-1">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            className={itemCls}
            activeProps={{ className: `${itemCls} ${activeCls}` }}
          >
            Início
          </Link>

          {isAdmin ? (
            <>
              {hasAdminSectionAccess(profile, "solicitacoes") ? (
                <Link
                  to="/admin/solicitacoes"
                  className={itemCls}
                  activeProps={{ className: `${itemCls} ${activeCls}` }}
                >
                  Solicitações Pendentes
                </Link>
              ) : null}
              {hasAdminSectionAccess(profile, "assinadas") ? (
                <Link
                  to="/admin/assinadas"
                  className={itemCls}
                  activeProps={{ className: `${itemCls} ${activeCls}` }}
                >
                  Assinadas
                </Link>
              ) : null}
              {hasAdminSectionAccess(profile, "controle_assinaturas") ? (
                <Link
                  to="/admin/controle-assinaturas"
                  className={itemCls}
                  activeProps={{ className: `${itemCls} ${activeCls}` }}
                >
                  Controle de Assinaturas
                </Link>
              ) : null}
              {hasAdminSectionAccess(profile, "conversas") ? (
                <Link
                  to="/admin/conversas"
                  className={itemCls}
                  activeProps={{ className: `${itemCls} ${activeCls}` }}
                >
                  Conversas
                </Link>
              ) : null}
              {hasAdminSectionAccess(profile, "whatsapp_usuarios") ? (
                <Link
                  to="/admin/whatsapp-usuarios"
                  className={itemCls}
                  activeProps={{ className: `${itemCls} ${activeCls}` }}
                >
                  Janelas WhatsApp
                </Link>
              ) : null}

              {hasAdminSectionAccess(profile, "cadastros") ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenCadastros((value) => !value)}
                    className={`${itemCls} flex w-full items-center justify-between text-left`}
                  >
                    <span>Cadastros</span>
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${openCadastros ? "rotate-0" : "-rotate-90"}`}
                    />
                  </button>
                  <div
                    className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${
                      openCadastros ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="ml-3 space-y-1 border-l border-sidebar-border pl-2 pt-1">
                        <Link
                          to="/admin/cadastros/usuarios"
                          className={itemCls}
                          activeProps={{ className: `${itemCls} ${activeCls}` }}
                        >
                          Usuários
                        </Link>
                        <Link
                          to="/admin/cadastros/produtos"
                          className={itemCls}
                          activeProps={{ className: `${itemCls} ${activeCls}` }}
                        >
                          Produtos
                        </Link>
                        <Link
                          to="/admin/cadastros/programas"
                          className={itemCls}
                          activeProps={{ className: `${itemCls} ${activeCls}` }}
                        >
                          Programas
                        </Link>
                        <Link
                          to="/admin/cadastros/locais"
                          className={itemCls}
                          activeProps={{ className: `${itemCls} ${activeCls}` }}
                        >
                          Locais
                        </Link>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Link
                to="/admin/requisicao"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Criar Requisição
              </Link>
              <Link
                to="/admin/minhas-assinaturas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Minhas Assinaturas
              </Link>
              <Link
                to="/admin/minhas-requisicoes"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Minhas Requisições
              </Link>
              <Link
                to="/admin/meus-assinados"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Documentos Assinados
              </Link>
            </>
          )}

          {(!isAdmin || !limitedAdmin || hasAdminSectionAccess(profile, "configuracoes")) ? (
            <Link
              to="/admin/configuracoes"
              className={itemCls}
              activeProps={{ className: `${itemCls} ${activeCls}` }}
            >
              Configurações
            </Link>
          ) : null}

          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
            className={`${itemCls} mt-4 w-full text-left`}
          >
            Sair
          </button>
        </nav>
      </aside>
      <main className="flex-1 bg-background">
        {showWhatsAppQrNotice ? (
          <Alert className="rounded-none border-none bg-primary px-4 py-2 text-center text-primary-foreground shadow-none">
            <AlertDescription className="text-xs font-medium tracking-[0.01em] sm:text-sm">
              Contato do almoxarifado: {ALMOXARIFADO_WHATSAPP_NUMBER}.{" "}
              <button
                type="button"
                onClick={() => void openWhatsAppActivationReminder()}
                className="underline decoration-1 underline-offset-4 hover:opacity-90"
              >
                Clique aqui
              </button>{" "}
              para abrir o QR Code e enviar a mensagem no WhatsApp.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="p-8">
          <Outlet />
        </div>
      </main>
      <Dialog open={whatsappReminderOpen} onOpenChange={setWhatsappReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fale com o almoxarifado pelo WhatsApp</DialogTitle>
            <DialogDescription>
              Aponte a câmera para o QR Code ou abra o link abaixo para enviar a mensagem.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4">
            <div className="flex size-56 items-center justify-center rounded-md border bg-white p-3">
              {whatsappQrCode ? (
                <img
                  src={whatsappQrCode}
                  alt="QR Code para abrir o WhatsApp do almoxarifado"
                  className="size-full"
                />
              ) : (
                <QrCode className="h-16 w-16 text-muted-foreground" />
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Número do almoxarifado: {ALMOXARIFADO_WHATSAPP_NUMBER}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="gap-2" asChild>
              <a href={ALMOXARIFADO_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            </Button>
            <Button type="button" className="gap-2" onClick={() => setWhatsappReminderOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={mustRegisterWhatsApp} onOpenChange={() => {}}>
        <DialogContent className="[&>button]:hidden">
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

            <Button type="submit" className="w-full gap-2" disabled={savingWhatsApp}>
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
