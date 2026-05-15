import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckCircle, ChevronDown, ExternalLink, Loader2, QrCode, Send } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  getCurrentUserProfile,
  isUserProfileIncomplete,
  type CurrentUserProfile,
} from "@/lib/user-profile";

const ALMOXARIFADO_WHATSAPP_NUMBER = "558896374400";
const ALMOXARIFADO_WHATSAPP_MESSAGE =
  "Olá, gostaria de receber notificações sobre o acompanhamento das minhas requisições e entregas do almoxarifado.";
const ALMOXARIFADO_WHATSAPP_LINK = `https://wa.me/${ALMOXARIFADO_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  ALMOXARIFADO_WHATSAPP_MESSAGE,
)}`;
const WHATSAPP_REMINDER_HOUR = 7;
const WHATSAPP_REMINDER_TIME_ZONE = "America/Fortaleza";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function getFortalezaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WHATSAPP_REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") current[part.type] = part.value;
      return current;
    }, {});

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function getMillisecondsUntilFortalezaReminder(date = new Date()) {
  const fortaleza = getFortalezaDateParts(date);
  const minutesNow = fortaleza.hour * 60 + fortaleza.minute;
  const reminderMinutes = WHATSAPP_REMINDER_HOUR * 60;

  if (minutesNow >= reminderMinutes) return 0;

  return (reminderMinutes - minutesNow) * 60 * 1000;
}

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [openCadastros, setOpenCadastros] = useState(pathname.startsWith("/admin/cadastros"));
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const [whatsappConfirmed, setWhatsappConfirmed] = useState(false);
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
        setWhatsappConfirmed(Boolean(profile?.whatsapp?.trim()));

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

  const itemCls =
    "block rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent transition-colors";
  const activeCls = "bg-sidebar-accent text-sidebar-foreground";
  const isAdmin = profile?.is_admin !== false;
  const mustRegisterWhatsApp =
    Boolean(profile?.id) &&
    !profile?.is_admin &&
    !profile?.whatsapp?.trim() &&
    !whatsappConfirmed &&
    pathname !== "/admin/completar-cadastro";
  const shouldShowWhatsAppNotice =
    Boolean(profile?.id) && profile?.is_admin === false && pathname !== "/admin/completar-cadastro";

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

  useEffect(() => {
    if (!profile?.id || profile.is_admin || pathname === "/admin/completar-cadastro" || mustRegisterWhatsApp) {
      setWhatsappReminderOpen(false);
      return;
    }

    const todayKey = getFortalezaDateParts().dateKey;
    const millisecondsUntilReminder = getMillisecondsUntilFortalezaReminder();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const showReminder = async () => {
      if (!active) return;

      try {
        const { data: acknowledgement, error: acknowledgementError } = await supabase
          .from("user_whatsapp_reminder_ack")
          .select("id")
          .eq("user_id", profile.id)
          .eq("reminder_date", todayKey)
          .maybeSingle();

        if (!active) return;
        if (acknowledgementError) throw new Error(acknowledgementError.message);
        if (acknowledgement) return;

        if (!active) return;
        await openWhatsAppActivationReminder();
      } catch {
        if (active) setWhatsappReminderOpen(true);
      }
    };

    if (millisecondsUntilReminder === 0) {
      void showReminder();
    } else {
      timeoutId = window.setTimeout(() => void showReminder(), millisecondsUntilReminder);
    }

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [mustRegisterWhatsApp, pathname, profile?.id, profile?.is_admin]);

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
      setWhatsappConfirmed(true);
      setProfile((current) => (current ? { ...current, whatsapp: savedWhatsApp } : current));
      setWhatsapp(savedWhatsApp);
      setWhatsappNotice(
        result.welcomeError
          ? "WhatsApp salvo, mas a mensagem de boas-vindas nao foi entregue agora."
          : "WhatsApp salvo com sucesso.",
      );
      if (result.welcomeError) {
        await openWhatsAppActivationReminder();
      }
    } catch (err) {
      setWhatsappError(
        err instanceof Error ? err.message : "Erro ao salvar WhatsApp. Tente novamente.",
      );
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleConfirmWhatsAppReminder = async () => {
    if (profile?.id) {
      await supabase
        .from("user_whatsapp_reminder_ack")
        .upsert(
          {
            user_id: profile.id,
            reminder_date: getFortalezaDateParts().dateKey,
          },
          { onConflict: "user_id,reminder_date" },
        );
    }
    setWhatsappReminderOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 bg-sidebar p-4 text-sidebar-foreground flex flex-col">
        <div className="mb-4 border-b border-sidebar-border px-3 py-4 text-xl">
          Almoxarifado
        </div>
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
              <Link
                to="/admin/solicitacoes"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Solicitações Pendentes
              </Link>
              <Link
                to="/admin/assinadas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Assinadas
              </Link>
              <Link
                to="/admin/controle-assinaturas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Controle de Assinaturas
              </Link>
              <Link
                to="/admin/conversas"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Conversas
              </Link>
              <Link
                to="/admin/whatsapp-usuarios"
                className={itemCls}
                activeProps={{ className: `${itemCls} ${activeCls}` }}
              >
                Janelas WhatsApp
              </Link>

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

          <Link
            to="/admin/configuracoes"
            className={itemCls}
            activeProps={{ className: `${itemCls} ${activeCls}` }}
          >
            Configurações
          </Link>

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
        {shouldShowWhatsAppNotice ? (
          <Alert className="rounded-none border-none bg-sidebar px-8 py-4 text-center text-sidebar-foreground shadow-none">
            <AlertDescription className="text-sm">
              Envie uma mensagem para o WhatsApp oficial do almoxarifado para receber avisos sobre
              o acompanhamento das suas requisições e entregas.
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
            <DialogTitle>Ative os avisos pelo WhatsApp</DialogTitle>
            <DialogDescription>
              Envie uma mensagem para o WhatsApp oficial do almoxarifado para receber avisos sobre
              suas requisições e entregas.
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
              Aponte a câmera para o QR Code ou abra o link abaixo e envie a mensagem no WhatsApp.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="gap-2" asChild>
              <a href={ALMOXARIFADO_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Abrir WhatsApp
              </a>
            </Button>
            <Button type="button" className="gap-2" onClick={handleConfirmWhatsAppReminder}>
              <CheckCircle className="h-4 w-4" />
              Já mandei mensagem
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
