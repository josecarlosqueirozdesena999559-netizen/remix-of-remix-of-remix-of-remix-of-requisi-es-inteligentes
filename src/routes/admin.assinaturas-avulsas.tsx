import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, Eye, Loader2, RotateCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { removeAttachmentFileSafely } from "@/lib/attachments";
import {
  AVULSA_PENDING_STATUSES,
  AVULSA_SIGNED_STATUS,
  getAvulsaAttachmentFiles,
  getAvulsaDisplayCode,
  getAvulsaStatusLabel,
  getRequiredAvulsaSignatureCount,
  isPdfFile,
  uploadAvulsaPdf,
  type AvulsaSignatureRow,
} from "@/lib/avulsa-signatures";
import { getCurrentUserProfile, isSharedSectorProfile } from "@/lib/user-profile";
import { getSelectedSharedRequesterProfile } from "@/lib/shared-sector-session";

export const Route = createFileRoute("/admin/assinaturas-avulsas")({
  component: AssinaturasAvulsasPage,
});

type TabKey = "pendentes" | "assinadas";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function getAvulsaUploadKey(itemId: string, index: number) {
  return `${itemId}:${index}`;
}

function getSignedAttachmentForIndex(item: AvulsaSignatureRow, index: number) {
  const signedFiles = getAvulsaAttachmentFiles(item.signed_attachment);
  const withSourceIndex = signedFiles.find(
    (attachment) => Number((attachment as any).sourceIndex) === index,
  );

  if (withSourceIndex) return withSourceIndex;
  if (signedFiles.some((attachment) => (attachment as any).sourceIndex !== undefined)) return null;
  return signedFiles[index] || null;
}

function getSignedAvulsaCount(item: AvulsaSignatureRow) {
  const requiredCount = getRequiredAvulsaSignatureCount(item);
  return Array.from({ length: requiredCount }).filter((_, index) =>
    Boolean(getSignedAttachmentForIndex(item, index)),
  ).length;
}
function AssinaturasAvulsasPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/assinaturas-avulsas";
  const [items, setItems] = useState<AvulsaSignatureRow[]>([]);
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Record<string, File>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [returningItem, setReturningItem] = useState<AvulsaSignatureRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);

  async function loadItems() {
    setLoading(true);
    setError(null);

    try {
      const { profile: authProfile } = await getCurrentUserProfile();
      const isSharedSector = isSharedSectorProfile(authProfile);
      const profile = isSharedSector
        ? await getSelectedSharedRequesterProfile(authProfile)
        : authProfile;

      if (!profile?.id) {
        if (isSharedSector) {
          navigate({ to: "/admin/selecionar-solicitante" });
        }

        setItems([]);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("assinaturas_avulsas" as any)
        .select("*")
        .eq("usuario_id", profile.id)
        .in("status", [...AVULSA_PENDING_STATUSES, AVULSA_SIGNED_STATUS])
        .order("updated_at", { ascending: false });

      if (loadError) throw new Error(loadError.message);
      setItems((data ?? []) as AvulsaSignatureRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar assinaturas avulsas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  const visibleItems = useMemo(() => {
    if (tab === "assinadas") return items.filter((item) => item.status === AVULSA_SIGNED_STATUS);
    return items.filter((item) => AVULSA_PENDING_STATUSES.includes(item.status as any));
  }, [items, tab]);

  if (isChildRoute) return <Outlet />;

  const handleUploadOne = async (item: AvulsaSignatureRow, file: File | undefined, index: number) => {
    if (!file) return;
    setMessage(null);
    setError(null);

    if (!isPdfFile(file)) {
      setError("Envie apenas arquivos PDF.");
      return;
    }

    const uploadKey = getAvulsaUploadKey(item.id, index);
    const oldSigned = getAvulsaAttachmentFiles(item.signed_attachment);
    setUploadingId(uploadKey);

    try {
      const uploaded = await uploadAvulsaPdf({ file, assinaturaId: item.id, signed: true, index });
      const nextSigned = oldSigned.filter(
        (attachment, attachmentIndex) =>
          Number((attachment as any).sourceIndex ?? attachmentIndex) !== index,
      );
      const signedAttachment = { ...uploaded, sourceIndex: index };
      nextSigned.push(signedAttachment as any);
      nextSigned.sort(
        (a, b) => Number((a as any).sourceIndex ?? 0) - Number((b as any).sourceIndex ?? 0),
      );

      const requiredCount = getRequiredAvulsaSignatureCount(item);
      const signedIndexes = new Set(
        nextSigned.map((attachment, attachmentIndex) =>
          Number((attachment as any).sourceIndex ?? attachmentIndex),
        ),
      );
      const isComplete = Array.from({ length: requiredCount }).every((_, signedIndex) =>
        signedIndexes.has(signedIndex),
      );

      const { error: updateError } = await supabase
        .from("assinaturas_avulsas" as any)
        .update({
          signed_attachment: nextSigned,
          status: isComplete ? AVULSA_SIGNED_STATUS : "aguardando_assinatura",
          return_reason: null,
          returned_at: null,
          signed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq("id", item.id);

      if (updateError) throw new Error(updateError.message);

      const replacedAttachment = getSignedAttachmentForIndex(item, index);
      if (replacedAttachment) {
        await removeAttachmentFileSafely(replacedAttachment, "old avulsa signed attachment");
      }

      setStagedFiles((current) => {
        const next = { ...current };
        delete next[uploadKey];
        return next;
      });

      if (isComplete) {
        setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
        setMessage("Todos os PDFs assinados foram enviados para o admin.");
      } else {
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.id === item.id
              ? { ...currentItem, signed_attachment: nextSigned, status: "aguardando_assinatura" }
              : currentItem,
          ),
        );
        setMessage("PDF assinado enviado. Continue assinando os PDFs restantes.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar assinatura avulsa.");
    } finally {
      setUploadingId(null);
    }
  };

  const submitReturn = async () => {
    if (!returningItem) return;
    const reason = returnReason.trim();
    if (!reason) {
      setError("Informe o motivo da devolucao.");
      return;
    }

    setReturnSaving(true);
    setMessage(null);
    setError(null);

    try {
      const oldSigned = getAvulsaAttachmentFiles(returningItem.signed_attachment);
      const { error: updateError } = await supabase
        .from("assinaturas_avulsas" as any)
        .update({
          status: "devolvido",
          signed_attachment: null,
          return_reason: reason,
          returned_at: new Date().toISOString(),
          signed_at: null,
        })
        .eq("id", returningItem.id);

      if (updateError) throw new Error(updateError.message);
      await Promise.all(
        oldSigned.map((attachment) =>
          removeAttachmentFileSafely(attachment, "returned avulsa signed attachment"),
        ),
      );
      setItems((current) =>
        current.map((item) =>
          item.id === returningItem.id
            ? { ...item, status: "devolvido", signed_attachment: null, return_reason: reason }
            : item,
        ),
      );
      setReturningItem(null);
      setReturnReason("");
      setMessage("Documento avulso devolvido ao admin.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao devolver documento avulso.");
    } finally {
      setReturnSaving(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, item: AvulsaSignatureRow, index: number) => {
    event.preventDefault();
    setDraggingId(null);
    const file = Array.from(event.dataTransfer.files || [])[0];
    if (file) {
      const uploadKey = getAvulsaUploadKey(item.id, index);
      setStagedFiles((current) => ({ ...current, [uploadKey]: file }));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuario / Assinaturas avulsas</p>
        <h2 className="text-2xl text-foreground">Assinaturas avulsas</h2>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={tab === "pendentes" ? "default" : "outline"}
            onClick={() => setTab("pendentes")}
          >
            Pendentes
          </Button>
          <Button
            type="button"
            variant={tab === "assinadas" ? "default" : "outline"}
            onClick={() => setTab("assinadas")}
          >
            Assinadas
          </Button>
        </div>
      </Card>

      {message ? (
        <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {message}
        </Card>
      ) : null}
      {error ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : visibleItems.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          {tab === "pendentes"
            ? "Nenhum documento avulso aguardando assinatura."
            : "Nenhum documento avulso assinado."}
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Documento</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                  <th className="px-3 py-2 text-right font-normal">Acao</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const adminFiles = getAvulsaAttachmentFiles(item.admin_attachment);
                  const requiredCount = getRequiredAvulsaSignatureCount(item);
                  const signedCount = getSignedAvulsaCount(item);
                  const isPending = item.status !== AVULSA_SIGNED_STATUS;
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">{item.titulo}</div>
                        <div className="text-xs text-muted-foreground">
                          Número: {getAvulsaDisplayCode(item)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          SIG: {item.saida_codigo || "-"}
                        </div>
                        {item.observacao ? (
                          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <span className="font-semibold">Mensagem do admin:</span>{" "}
                            {item.observacao}
                          </div>
                        ) : null}
                        {isPending ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Assine os PDFs separadamente: {signedCount}/{requiredCount} enviado(s).
                          </div>
                        ) : null}
                        {item.return_reason ? (
                          <div className="text-xs text-orange-700">
                            Motivo: {item.return_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{getAvulsaStatusLabel(item.status)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            navigate({
                              to: "/admin/assinaturas-avulsas/$assinaturaId/pdf",
                              params: { assinaturaId: item.id },
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                          Ver/Baixar
                        </Button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isPending ? (
                          <div className="space-y-2">
                            {item.status === "aguardando_assinatura" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2 text-orange-700"
                                onClick={() => setReturningItem(item)}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Devolver
                              </Button>
                            ) : null}
                            {(adminFiles.length > 0 ? adminFiles : Array.from({ length: requiredCount })).map((adminFile, index) => {
                              const uploadKey = getAvulsaUploadKey(item.id, index);
                              const stagedFile = stagedFiles[uploadKey];
                              const signedFile = getSignedAttachmentForIndex(item, index);
                              const isUploading = uploadingId === uploadKey;

                              return (
                                <div
                                  key={uploadKey}
                                  className={`flex flex-wrap items-center justify-end gap-2 rounded-md border px-2 py-2 ${draggingId === uploadKey ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-background"}`}
                                  onDragEnter={() => setDraggingId(uploadKey)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDragLeave={() => setDraggingId(null)}
                                  onDrop={(event) => handleDrop(event, item, index)}
                                >
                                  <div className="min-w-0 flex-1 text-left text-xs">
                                    <div className="font-semibold text-foreground">
                                      PDF {index + 1}{adminFile?.fileName ? ` - ${adminFile.fileName}` : ""}
                                    </div>
                                    <div className={signedFile ? "text-emerald-700" : "text-muted-foreground"}>
                                      {signedFile ? "Assinado enviado" : "Aguardando este PDF assinado"}
                                    </div>
                                  </div>
                                  <input
                                    id={`avulsa-${item.id}-${index}`}
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    className="hidden"
                                    onChange={(event) => {
                                      const file = Array.from(event.target.files || [])[0];
                                      if (file) {
                                        setStagedFiles((current) => ({ ...current, [uploadKey]: file }));
                                      }
                                      event.currentTarget.value = "";
                                    }}
                                  />
                                  {stagedFile ? (
                                    <>
                                      <span className="max-w-44 truncate rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                        {stagedFile.name}
                                      </span>
                                      <Button
                                        type="button"
                                        size="icon"
                                        disabled={isUploading}
                                        onClick={() => void handleUploadOne(item, stagedFile, index)}
                                      >
                                        {isUploading ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Check className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="gap-2"
                                      disabled={isUploading}
                                      onClick={() =>
                                        document.getElementById(`avulsa-${item.id}-${index}`)?.click()
                                      }
                                    >
                                      {isUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Upload className="h-4 w-4" />
                                      )}
                                      {signedFile ? "Substituir" : "Anexar"}
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Enviado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={Boolean(returningItem)}
        onOpenChange={(open) => !open && setReturningItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver documento avulso</DialogTitle>
            <DialogDescription>
              Informe o motivo para o admin corrigir ou reenviar o documento.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            placeholder="Descreva o motivo da devolucao"
            rows={4}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReturningItem(null)}
              disabled={returnSaving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submitReturn()} disabled={returnSaving}>
              {returnSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
