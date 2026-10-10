import { AlertCircle, CheckCircle2, Loader2, PenLine, ShieldCheck, Trash2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";

interface DemoSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  documentCode: string;
  documentStage: "request" | "output";
  sourcePdf: Blob | null;
  onCompleted: (result: { status?: string; signature_id?: string }) => void;
}

type Step = "loading" | "draw" | "enroll" | "review" | "code";

function getFunctionError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}

async function invokeDemoSignature(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("demo-signature", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      const payload = await context.json().catch(() => null);
      if (typeof payload?.error === "string") throw new Error(payload.error);
    }
    throw new Error(error.message || "Erro na função de assinatura.");
  }
  if (!data?.ok) throw new Error(data?.error || "A operação não foi confirmada no servidor.");
  return data;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Não foi possível preparar o PDF."));
      else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o PDF para assinatura."));
    reader.readAsDataURL(blob);
  });
}

export function DemoSignatureDialog({
  open,
  onOpenChange,
  requestId,
  documentCode,
  documentStage,
  sourcePdf,
  onCompleted,
}: DemoSignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const drewRef = useRef(false);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [signatureRequestId, setSignatureRequestId] = useState("");
  const [originalHash, setOriginalHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!sourcePdf) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(sourcePdf);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourcePdf]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    setBusy(false);
    setConsent(false);
    setCode("");
    setSignatureRequestId("");
    setOriginalHash("");
    setQrDataUrl("");
    setManualSecret("");
    setStep("loading");

    async function loadStatus() {
      try {
        const status = await invokeDemoSignature({ action: "status" });
        if (!active) return;
        setSignatureSaved(Boolean(status.signature_saved));

        const { data, error: factorError } = await supabase.auth.mfa.listFactors();
        if (factorError) throw new Error(factorError.message);
        const verifiedFactor = (data?.totp || []).find((factor) => factor.status === "verified");
        if (verifiedFactor) setFactorId(verifiedFactor.id);
        const hasTotp = Boolean(verifiedFactor);
        setTotpEnabled(hasTotp);
        setStep(!status.signature_saved ? "draw" : !hasTotp ? "enroll" : "review");
      } catch (loadError) {
        if (active) {
          setError(getFunctionError(loadError));
          setStep("draw");
        }
      }
    }

    void loadStatus();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open || step !== "draw") return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 3.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#12201b";
    drewRef.current = false;
  }, [open, step]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getCanvasPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    drawingRef.current = true;
    drewRef.current = true;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current) {
      drawingRef.current = false;
      event.currentTarget.getContext("2d")?.closePath();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drewRef.current = false;
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !drewRef.current) {
      setError("Desenhe sua assinatura antes de salvar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invokeDemoSignature({
        action: "save_signature",
        signaturePng: canvas.toDataURL("image/png"),
      });
      setSignatureSaved(true);
      await startEnrollment();
    } catch (saveError) {
      setError(getFunctionError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const startEnrollment = async () => {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw new Error(listError.message);
    const verifiedFactor = (factors?.totp || []).find((factor) => factor.status === "verified");
    if (verifiedFactor) {
      setFactorId(verifiedFactor.id);
      setTotpEnabled(true);
      setStep("review");
      return;
    }

    for (const pending of (factors?.totp || []).filter((factor) => factor.status !== "verified")) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: pending.id });
      if (unenrollError) throw new Error(unenrollError.message);
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Assinatura eletrônica — demonstração",
    });
    if (enrollError) throw new Error(enrollError.message);
    if (!data?.id || !data.totp?.uri || !data.totp?.secret) {
      throw new Error("O Supabase não retornou os dados de ativação do autenticador.");
    }
    const qr = await QRCode.toDataURL(data.totp.uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });
    setFactorId(data.id);
    setQrDataUrl(qr);
    setManualSecret(data.totp.secret);
    setStep("enroll");
  };

  useEffect(() => {
    if (!open || step !== "enroll" || !signatureSaved || totpEnabled || qrDataUrl || factorId)
      return;
    let active = true;
    void startEnrollment().catch((enrollError) => {
      if (active) setError(getFunctionError(enrollError));
    });
    return () => {
      active = false;
    };
  }, [open, step, signatureSaved, totpEnabled, qrDataUrl, factorId]);

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) {
      setError("Informe o código de seis dígitos mostrado no aplicativo autenticador.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (verifyError) throw new Error(verifyError.message);
      await invokeDemoSignature({ action: "totp_enabled" });
      setTotpEnabled(true);
      setCode("");
      setQrDataUrl("");
      setManualSecret("");
      setStep("review");
    } catch (verifyError) {
      setError(getFunctionError(verifyError));
    } finally {
      setBusy(false);
    }
  };

  const requestSignatureCode = async () => {
    if (!sourcePdf) {
      setError("O PDF não está pronto para visualização e assinatura.");
      return;
    }
    if (!consent) {
      setError("Marque a confirmação expressa antes de solicitar a assinatura.");
      return;
    }
    if (!factorId || !totpEnabled) {
      setError("Ative o Google Authenticator antes de assinar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const base64 = await blobToBase64(sourcePdf);
      const intent = await invokeDemoSignature({
        action: "begin_signature",
        requestId,
        sourcePdfBase64: base64,
      });
      setSignatureRequestId(intent.signature_request_id);
      setOriginalHash(intent.original_sha256);
      setCode("");
      setStep("code");
    } catch (beginError) {
      setError(getFunctionError(beginError));
    } finally {
      setBusy(false);
    }
  };

  const confirmSignature = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Digite os seis dígitos do seu Google Authenticator.");
      return;
    }
    if (!signatureRequestId || !factorId) {
      setError("A solicitação expirou. Feche e inicie novamente.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw new Error(verifyError.message);
      const result = await invokeDemoSignature({
        action: "complete_signature",
        signatureRequestId,
      });
      onCompleted({ status: result.status, signature_id: result.signature_id });
      onOpenChange(false);
    } catch (confirmError) {
      setError(getFunctionError(confirmError));
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle =
    step === "draw"
      ? "Cadastre sua assinatura"
      : step === "enroll"
        ? "Ative o Google Authenticator"
        : step === "code"
          ? "Confirme sua identidade"
          : step === "review"
            ? "Revise e assine o documento"
            : "Preparando assinatura";

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "draw" ? (
              <PenLine className="h-5 w-5 text-primary" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary" />
            )}
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            Demonstração de assinatura eletrônica para o usuário de teste. A assinatura visual não
            é, por si só, um certificado ICP-Brasil.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {step === "loading" ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando cadastro e segundo fator...
          </div>
        ) : null}

        {step === "draw" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Desenhe no quadro com o dedo, caneta ou mouse. A imagem será salva em armazenamento
              privado e vinculada somente à sua conta.
            </p>
            <canvas
              ref={canvasRef}
              width={760}
              height={250}
              aria-label="Área para desenhar a assinatura manuscrita"
              className="h-56 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-xs text-muted-foreground">Confira o desenho antes de salvar.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearCanvas}
                disabled={busy}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Apagar e redesenhar
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={() => void saveSignature()} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Salvar assinatura
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "enroll" ? (
          <form className="space-y-4" onSubmit={verifyEnrollment}>
            <p className="text-sm text-muted-foreground">
              Escaneie o QR Code no Google Authenticator, Microsoft Authenticator ou outro app
              compatível com TOTP. Depois, digite o código de seis dígitos para confirmar a
              ativação.
            </p>
            {qrDataUrl ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-white p-4">
                <img
                  src={qrDataUrl}
                  alt="QR Code de configuração do autenticador"
                  className="h-60 w-60"
                />
                <p className="max-w-md break-all text-center text-xs text-muted-foreground">
                  Configuração manual (mantenha em sigilo):{" "}
                  <strong className="font-mono">{manualSecret}</strong>
                </p>
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  Carregando configuração segura do autenticador...
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="demo-enroll-code">Código do aplicativo</Label>
              <Input
                id="demo-enroll-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !qrDataUrl || code.length !== 6}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Confirmar ativação
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {step === "review" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                Assinatura manuscrita cadastrada
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                Google Authenticator ativado
              </span>
            </div>
            <div className="rounded-lg border bg-slate-100 p-2">
              {previewUrl ? (
                <iframe
                  src={`${previewUrl}#toolbar=1&navpanes=1&view=FitH`}
                  title={`PDF ${documentCode} para assinatura`}
                  className="h-[52vh] min-h-72 w-full rounded bg-white"
                />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  Gerando pré-visualização do PDF…
                </p>
              )}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Documento {documentCode} · etapa{" "}
              {documentStage === "output" ? "saída" : "solicitação"}. A confirmação será registrada
              para a versão exata deste PDF, por meio de código TOTP. Uma folha de evidências
              visuais será anexada sem sobrepor o documento original.
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 accent-emerald-600"
              />
              <span>
                Confirmo que revisei o PDF e autorizo, conscientemente, a assinatura desta versão da
                solicitação.
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void requestSignatureCode()}
                disabled={busy || !sourcePdf || !consent}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Assinar com autenticador
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "code" ? (
          <form className="space-y-4" onSubmit={confirmSignature}>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                A solicitação de uso único está vinculada ao hash SHA-256{" "}
                <span className="break-all font-mono">{originalHash}</span>. Abra o Google
                Authenticator e informe um código atual para confirmar a assinatura.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="demo-signature-code">Código de seis dígitos</Label>
              <Input
                id="demo-signature-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O código não é armazenado. O servidor registra apenas o resultado da validação e o
              passo temporal para impedir reutilização.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("review")}
                disabled={busy}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirmar assinatura
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
