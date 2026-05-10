import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, Mail, Save, Smartphone } from "lucide-react";
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

function getNumbersFromResult(result: unknown): string[] {
  if (Array.isArray(result)) return result.map(String);

  if (result && typeof result === "object") {
    const response = result as { numbers?: unknown; data?: unknown; result?: unknown };
    if (Array.isArray(response.numbers)) return response.numbers.map(String);
    if (response.data) return getNumbersFromResult(response.data);
    if (response.result) return getNumbersFromResult(response.result);
  }

  return [];
}

function ConfiguracoesPage() {
  const navigate = useNavigate();
  const [emailAtual, setEmailAtual] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
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

        const currentEmail = user.email ?? profile?.email ?? "";
        setEmailAtual(currentEmail);
        setNovoEmail(currentEmail);
        setIsAdmin(Boolean(profile?.is_admin));

        if (profile?.is_admin) {
          try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw new Error(sessionError.message);

            const accessToken = sessionData.session?.access_token;
            if (!accessToken) throw new Error("Sessao expirada.");

            const result = await getWhatsAppAdminNumbers({
              data: {},
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            setAdminNumbers(getNumbersFromResult(result).join("\n"));
          } catch (error) {
            setAdminNumbersError(getErrorMessage(error, "Erro ao carregar numeros."));
          }
        }
      } catch (error) {
        if (active) {
          setEmailError(getErrorMessage(error, "Erro ao carregar usuário."));
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

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailError(null);
    setEmailMessage(null);

    const trimmedEmail = novoEmail.trim();

    if (!trimmedEmail) {
      setEmailError("Informe o novo e-mail.");
      return;
    }

    if (trimmedEmail === emailAtual) {
      setEmailError("Informe um e-mail diferente do atual.");
      return;
    }

    setSavingEmail(true);

    try {
      const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (error) throw new Error(error.message);

      setNovoEmail(trimmedEmail);
      setEmailMessage(
        "Solicitação enviada. Verifique o novo e-mail para confirmar a alteração.",
      );
    } catch (error) {
      setEmailError(getErrorMessage(error, "Erro ao alterar e-mail."));
    } finally {
      setSavingEmail(false);
    }
  };

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
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sessao expirada.");

      const result = await saveWhatsAppAdminNumbers({
        data: { numbers: adminNumbers },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      setAdminNumbers(getNumbersFromResult(result).join("\n"));
      setAdminNumbersMessage("Numeros autorizados salvos.");
    } catch (error) {
      setAdminNumbersError(getErrorMessage(error, "Erro ao salvar numeros."));
    } finally {
      setSavingAdminNumbers(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
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
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                E-mail
              </CardTitle>
              <CardDescription>Atualize o e-mail usado para acessar o sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleEmailSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="email-atual">E-mail atual</Label>
                  <Input id="email-atual" value={emailAtual} disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="novo-email">Novo e-mail</Label>
                  <Input
                    id="novo-email"
                    type="email"
                    value={novoEmail}
                    onChange={(event) => setNovoEmail(event.target.value)}
                    placeholder="novo@email.com"
                    required
                  />
                </div>

                {emailError && (
                  <Alert variant="destructive">
                    <AlertDescription>{emailError}</AlertDescription>
                  </Alert>
                )}
                {emailMessage && (
                  <Alert>
                    <AlertDescription>{emailMessage}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={savingEmail}>
                  {savingEmail ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar e-mail
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-primary" />
                Senha
              </CardTitle>
              <CardDescription>Defina uma nova senha para sua conta.</CardDescription>
            </CardHeader>
            <CardContent>
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
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Smartphone className="h-5 w-5 text-primary" />
                  WhatsApp dos administradores
                </CardTitle>
                <CardDescription>
                  Numeros autorizados a enviar foto do QR Code para confirmar retirada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleAdminNumbersSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="admin-whatsapp-numbers">Numeros autorizados</Label>
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
                    Salvar numeros
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
