import { AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { PdfDocumentViewer } from "@/components/PdfDocumentViewer";

interface DemoSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId?: string;
  documentCode?: string;
  sourcePdf?: Blob | null;
  onCompleted?: (result: { status?: string; signature_id?: string }) => void;
  setupOnly?: boolean;
}

type Step = "loading" | "draw" | "review" | "preview" | "code" | "complete";

function getFunctionError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}

function formatOtpCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

export function DemoSignatureDialog({
  open,
  onOpenChange,
  requestId,
  documentCode = "",
  sourcePdf = null,
  onCompleted = () => undefined,
  setupOnly = false,
}: DemoSignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const drewRef = useRef(false);
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [phoneHint, setPhoneHint] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [consent, setConsent] = useState(false);
  const [previewConsent, setPreviewConsent] = useState(false);
  const [signatureRequestId, setSignatureRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [signedPreviewUrl, setSignedPreviewUrl] = useState("");

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
    if (!open || step !== "code" || !otpExpiresAt) {
      setOtpSecondsLeft(0);
      return;
    }
    const updateRemaining = () => {
      setOtpSecondsLeft(Math.max(0, Math.ceil((Date.parse(otpExpiresAt) - Date.now()) / 1000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [open, step, otpExpiresAt]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(null);
    setBusy(false);
    setConsent(false);
    setPreviewConsent(false);
    setCode("");
    setPhoneHint("");
    setOtpExpiresAt(null);
    setOtpSecondsLeft(0);
    setSignatureRequestId("");
    setSignedPreviewUrl("");
    setStep("loading");

    async function loadStatus() {
      try {
        const status = await invokeDemoSignature({ action: "status" });
        if (!active) return;
        setStep(!status.signature_saved ? "draw" : setupOnly ? "complete" : "review");
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
  }, [open, setupOnly]);

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
      setStep(setupOnly ? "complete" : "review");
    } catch (saveError) {
      setError(getFunctionError(saveError));
    } finally {
      setBusy(false);
    }
  };

  const prepareSignedPreview = async () => {
    if (!sourcePdf) {
      setError("O PDF não está pronto para visualização e assinatura.");
      return;
    }
    if (!requestId) {
      setError("A solicitação de assinatura não foi identificada. Feche e tente novamente.");
      return;
    }
    if (!consent) {
      setError("Confirme que deseja assinar este documento.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let intentId = signatureRequestId;
      if (!intentId) {
        const intent = await invokeDemoSignature({
          action: "begin_signature",
          requestId,
        });
        intentId = String(intent.signature_request_id || "");
        if (!intentId) throw new Error("Não foi possível iniciar a assinatura.");
        setSignatureRequestId(intentId);
      }
      const preview = await invokeDemoSignature({
        action: "preview_signature",
        signatureRequestId: intentId,
      });
      if (typeof preview.preview_url !== "string") {
        throw new Error("Não foi possível preparar a prévia assinada do PDF.");
      }
      setSignedPreviewUrl(preview.preview_url);
      setPreviewConsent(false);
      setCode("");
      setOtpExpiresAt(null);
      setStep("preview");
    } catch (beginError) {
      setError(getFunctionError(beginError));
    } finally {
      setBusy(false);
    }
  };

  const continueFromPreview = async () => {
    if (!previewConsent) {
      setError("Confirme que revisou a prévia da assinatura.");
      return;
    }
    if (!signatureRequestId) {
      setError("A solicitação expirou. Feche e inicie novamente.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await invokeDemoSignature({
        action: "confirm_preview",
        signatureRequestId,
      });
      const delivery = await invokeDemoSignature({
        action: "send_signature_otp",
        signatureRequestId,
      });
      setPhoneHint(String(delivery.phone_hint || ""));
      setOtpExpiresAt(String(delivery.expires_at || ""));
      setOtpSecondsLeft(Number(delivery.valid_for_seconds) || 60);
      setCode("");
      setStep("code");
    } catch (previewError) {
      setError(getFunctionError(previewError));
    } finally {
      setBusy(false);
    }
  };

  const resendSignatureOtp = async () => {
    if (!signatureRequestId) {
      setError("A solicitação expirou. Feche e inicie novamente.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const delivery = await invokeDemoSignature({
        action: "send_signature_otp",
        signatureRequestId,
      });
      setPhoneHint(String(delivery.phone_hint || ""));
      setOtpExpiresAt(String(delivery.expires_at || ""));
      setOtpSecondsLeft(Number(delivery.valid_for_seconds) || 60);
      setCode("");
    } catch (sendError) {
      setError(getFunctionError(sendError));
    } finally {
      setBusy(false);
    }
  };

  const closeSigningFlow = () => {
    if (busy) return;
    const pendingRequestId = signatureRequestId;
    setSignatureRequestId("");
    setSignedPreviewUrl("");
    setPreviewConsent(false);
    onOpenChange(false);
    if (pendingRequestId) {
      void invokeDemoSignature({
        action: "cancel_signature",
        signatureRequestId: pendingRequestId,
      }).catch(() => undefined);
    }
  };

  const confirmSignature = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Digite os seis dígitos enviados pelo WhatsApp.");
      return;
    }
    if (!signatureRequestId) {
      setError("A solicitação expirou. Feche e inicie novamente.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let result;
      try {
        result = await invokeDemoSignature({
          action: "complete_signature",
          signatureRequestId,
          code,
        });
      } catch (completionError) {
        throw new Error(`Falha ao registrar a assinatura: ${getFunctionError(completionError)}`);
      }
      setSignatureRequestId("");
      setSignedPreviewUrl("");
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
      : step === "code"
        ? "Confirme a assinatura"
        : step === "review"
          ? "Revise e assine o documento"
          : step === "complete"
            ? "Configuração concluída"
            : "Preparando assinatura";

  const isPdfStage = step === "review" || step === "preview";

  return (
    <>
      {open && step === "review" ? (
        <PdfDocumentViewer
          title={`Revise o documento ${documentCode}`}
          subtitle="Etapa 1 de 3 · Leia o PDF e confirme que deseja assiná-lo."
          url={previewUrl}
          fileName={`${documentCode || "documento"}.pdf`}
          loading={!previewUrl}
          loadingLabel="Carregando documento..."
          error={error}
          onBack={closeSigningFlow}
          fitHeight
          footer={
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>Li o PDF e quero assinar este documento.</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeSigningFlow} disabled={busy}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void prepareSignedPreview()}
                  disabled={busy || !previewUrl || !consent}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Próximo
                </Button>
              </div>
            </div>
          }
        />
      ) : null}

      {open && step === "preview" ? (
        <PdfDocumentViewer
          title="Confira a assinatura no PDF"
          subtitle="Etapa 2 de 3 · A rubrica foi aplicada no campo de assinatura do documento."
          url={signedPreviewUrl}
          fileName={`${documentCode || "documento"}-previa-assinatura.pdf`}
          loading={!signedPreviewUrl}
          loadingLabel="Preparando prévia da assinatura..."
          error={error}
          onBack={closeSigningFlow}
          fitHeight
          footer={
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={previewConsent}
                  onChange={(event) => setPreviewConsent(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <span>Conferi a prévia da assinatura e quero continuar.</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setStep("review");
                  }}
                  disabled={busy}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  onClick={continueFromPreview}
                  disabled={busy || !previewConsent}
                >
                  Próximo
                </Button>
              </div>
            </div>
          }
        />
      ) : null}

      <Dialog
        open={open && !isPdfStage}
        onOpenChange={(next) => {
          if (!next) closeSigningFlow();
        }}
      >
        <DialogContent
          className={
            step === "code"
              ? "h-dvh max-h-dvh w-screen max-w-none content-center justify-items-center rounded-none border-0 p-6"
              : "max-h-[94vh] w-[96vw] max-w-md overflow-y-auto"
          }
        >
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {step === "loading" ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
            </div>
          ) : null}

          {step === "complete" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sua assinatura está cadastrada. Esse cadastro não assina nenhum documento; cada
                assinatura exige revisar o PDF e confirmar o código OTP.
              </p>
              <DialogFooter>
                <Button type="button" onClick={() => onOpenChange(false)}>
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {step === "draw" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Desenhe sua assinatura no quadro abaixo.
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
                <Button type="button" variant="outline" onClick={closeSigningFlow} disabled={busy}>
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

          {step === "code" ? (
            <form className="mx-auto w-full max-w-md space-y-4" onSubmit={confirmSignature}>
              <p className="text-sm text-muted-foreground">
                Etapa 3 de 3 · Digite o código enviado para o WhatsApp cadastrado.
              </p>
              <p className="text-sm text-muted-foreground">
                Enviado para {phoneHint || "o WhatsApp do perfil"}.{" "}
                {otpSecondsLeft > 0
                  ? `O código expira em ${formatOtpCountdown(otpSecondsLeft)}.`
                  : "O código expirou. Solicite outro para continuar."}
              </p>
              <div className="space-y-2">
                <Label htmlFor="demo-signature-code">Código do WhatsApp</Label>
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
              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void resendSignatureOtp()}
                  disabled={busy || otpSecondsLeft > 240}
                >
                  Reenviar código
                </Button>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setStep("preview");
                    }}
                    disabled={busy}
                  >
                    Voltar
                  </Button>
                  <Button type="submit" disabled={busy || code.length !== 6 || otpSecondsLeft <= 0}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirmar assinatura
                  </Button>
                </div>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
