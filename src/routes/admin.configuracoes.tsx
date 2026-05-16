import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, Save, Smartphone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getWhatsAppAdminNumbers,
  saveWhatsAppAdminNumbers,
} from "@/lib/app-settings-actions";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/configuracoes")({
  component: ConfiguracoesPage,
});

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface AdminWelcomeNotificationResult {
  ok?: boolean;
}

interface WhatsAppAdminNumbersResult {
  numbers?: unknown;
  welcomeNotifications?: unknown;
  data?: unknown;
  result?: unknown;
}

function unwrapWhatsAppAdminNumbersResult(value: unknown): WhatsAppAdminNumbersResult {
  if (!value || typeof value !== "object") return {};

  const candidate = value as WhatsAppAdminNumbersResult;

  if (Array.isArray(candidate.numbers) || Array.isArray(candidate.welcomeNotifications)) {
    return candidate;
  }

  if (candidate.data) return unwrapWhatsAppAdminNumbersResult(candidate.data);
  if (candidate.result) return unwrapWhatsAppAdminNumbersResult(candidate.result);

  return candidate;
}

function getAdminNumbersFromResult(value: unknown) {
  const result = unwrapWhatsAppAdminNumbersResult(value);
  return Array.isArray(result.numbers) ? result.numbers.map(String) : [];
}

function getWelcomeNotificationsFromResult(value: unknown) {
  const result = unwrapWhatsAppAdminNumbersResult(value);
  return Array.isArray(result.welcomeNotifications)
    ? (result.welcomeNotifications as AdminWelcomeNotificationResult[])
    : [];
}

function ConfiguracoesPage() {
  const navigate = useNavigate();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [cpf, setCpf] = useState("");
  const [funcao, setFuncao] = useState("");
  const [setor, setSetor] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminNumbers, setAdminNumbers] = useState("");
  const [savingAdminNumbers, setSavingAdminNumbers] = useState(false);
  const [adminNumbersMessage, setAdminNumbersMessage] = useState<string | null>(null);
  const [adminNumbersError, setAdminNumbersError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      setLoading(true);

      try {
        const { user, profile } = await getCurrentUserProfile();

        if (!active) return;

        if (!user) {
          navigate({ to: "/" });
          return;
        }

        setNome(profile?.nome ?? "");
        setUsuario(profile?.usuario ?? "");
        setCpf(profile?.cpf ?? "");
        setFuncao(profile?.funcao ?? "");
        setSetor(profile?.setor ?? profile?.unidade_nome ?? "");
        setWhatsapp(profile?.whatsapp ?? "");
        setIsAdmin(Boolean(profile?.is_admin));

        if (profile?.is_admin) {
          try {
            const result = await getWhatsAppAdminNumbers();
            setAdminNumbers(getAdminNumbersFromResult(result).join("\n"));
          } catch (error) {
            setAdminNumbersError(getErrorMessage(error, "Erro ao carregar números."));
          }
        }
      } catch (error) {
        if (active) {
          setPasswordError(getErrorMessage(error, "Erro ao carregar usuário."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, [navigate]);

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (novaSenha.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setPasswordError("As senhas não conferem.");
      return;
    }

    setSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw new Error(error.message);

      setNovaSenha("");
      setConfirmarSenha("");
      setPasswordMessage("Senha alterada com sucesso.");
    } catch (error) {
      setPasswordError(getErrorMessage(error, "Erro ao alterar senha."));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAdminNumbersSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminNumbersError(null);
    setAdminNumbersMessage(null);
    setSavingAdminNumbers(true);

    try {
      const result = await saveWhatsAppAdminNumbers({ data: { numbers: adminNumbers } });
      const numbers = getAdminNumbersFromResult(result);
      const welcomeNotifications = getWelcomeNotificationsFromResult(result);
      const failedWelcomes = welcomeNotifications.filter((item) => !item.ok);
      const sentWelcomes = welcomeNotifications.length - failedWelcomes.length;

      setAdminNumbers(numbers.join("\n"));
      setAdminNumbersMessage(
        sentWelcomes > 0
          ? `Números autorizados salvos. Boas-vindas enviadas para ${sentWelcomes} novo(s) número(s).`
          : "Números autorizados salvos.",
      );

      if (failedWelcomes.length) {
        setAdminNumbersError(
          `Números salvos, mas não foi possível enviar boas-vindas para ${failedWelcomes.length} número(s).`,
        );
      }
    } catch (error) {
      setAdminNumbersError(getErrorMessage(error, "Erro ao salvar números."));
    } finally {
      setSavingAdminNumbers(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Conta</p>
        <h2 className="text-2xl text-foreground">Configurações</h2>
      </div>

      {loading ? (
        <Card className="p-6">
          <div className="flex h-28 items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        </Card>
      ) : (
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5 text-primary" />
                Dados do usuário
              </CardTitle>
              <CardDescription>Informações cadastradas para identificar suas requisições.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="mt-1 text-foreground">{nome || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Usuário</dt>
                  <dd className="mt-1 text-foreground">{usuario || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">CPF</dt>
                  <dd className="mt-1 text-foreground">{cpf || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Função</dt>
                  <dd className="mt-1 text-foreground">{funcao || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Setor</dt>
                  <dd className="mt-1 text-foreground">{setor || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">WhatsApp</dt>
                  <dd className="mt-1 text-foreground">{whatsapp || "-"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" />
                Acesso
              </CardTitle>
              <CardDescription>Confira seu usuário de acesso e altere a senha.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="usuario-acesso">Usuário de acesso</Label>
                <Input id="usuario-acesso" value={usuario || "-"} disabled />
              </div>

              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    value={novaSenha}
                    onChange={(event) => setNovaSenha(event.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha">Confirmar senha</Label>
                  <Input
                    id="confirmar-senha"
                    type="password"
                    value={confirmarSenha}
                    onChange={(event) => setConfirmarSenha(event.target.value)}
                    placeholder="Digite a senha novamente"
                    required
                  />
                </div>

                {passwordError && (
                  <Alert variant="destructive">
                    <AlertDescription>{passwordError}</AlertDescription>
                  </Alert>
                )}
                {passwordMessage && (
                  <Alert>
                    <AlertDescription>{passwordMessage}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={savingPassword}>
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar senha
                </Button>
              </form>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Smartphone className="h-5 w-5 text-primary" />
                  WhatsApp dos administradores
                </CardTitle>
                <CardDescription>
                  Números autorizados a enviar foto do QR Code para confirmar retirada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleAdminNumbersSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="admin-whatsapp-numbers">Números autorizados</Label>
                    <Textarea
                      id="admin-whatsapp-numbers"
                      value={adminNumbers}
                      onChange={(event) => setAdminNumbers(event.target.value)}
                      placeholder={"5588999999999\n5588988888888"}
                      rows={5}
                    />
                  </div>

                  {adminNumbersError && (
                    <Alert variant="destructive">
                      <AlertDescription>{adminNumbersError}</AlertDescription>
                    </Alert>
                  )}
                  {adminNumbersMessage && (
                    <Alert>
                      <AlertDescription>{adminNumbersMessage}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={savingAdminNumbers}>
                    {savingAdminNumbers ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Salvar números
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
