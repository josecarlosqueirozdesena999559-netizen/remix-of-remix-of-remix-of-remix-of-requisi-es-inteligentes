import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { removeAttachmentFileSafely } from "@/lib/attachments";
import {
  AVULSA_SIGNED_STATUS,
  getAvulsaAttachmentFiles,
  getAvulsaDisplayCode,
  getAvulsaStatusLabel,
  type AvulsaSignatureRow,
} from "@/lib/avulsa-signatures";
import { getCurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/assinaturas-avulsas-assinadas")({
  component: ControleAssinaturasAvulsasPage,
});

type TabKey = "pendentes" | "assinadas";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function ControleAssinaturasAvulsasPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AvulsaSignatureRow[]>([]);
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [returningItem, setReturningItem] = useState<AvulsaSignatureRow | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const { profile } = await getCurrentUserProfile();

      if (!profile?.is_admin) {
        setError("Apenas administradores podem acessar o controle de assinaturas avulsas.");
        return;
      }

      const { data, error: loadError } = await supabase
        .from("assinaturas_avulsas" as any)
        .select("*")
        .in("status", ["aguardando_assinatura", AVULSA_SIGNED_STATUS])
        .order("updated_at", { ascending: false });

      if (loadError) throw new Error(loadError.message);
      setItems((data ?? []) as AvulsaSignatureRow[]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar controle de assinaturas avulsas.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      pendentes: items.filter((item) => item.status === "aguardando_assinatura").length,
      assinadas: items.filter((item) => item.status === AVULSA_SIGNED_STATUS).length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab === "pendentes" && item.status !== "aguardando_assinatura") return false;
      if (tab === "assinadas" && item.status !== AVULSA_SIGNED_STATUS) return false;
      if (!query) return true;

      return [
        item.avulsa_codigo,
        item.saida_codigo,
        item.titulo,
        item.solicitante,
        item.setor,
        item.observacao,
        item.return_reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [items, search, tab]);

  const submitReturn = async () => {
    if (!returningItem) return;
    const reason = returnReason.trim();
    if (!reason) {
      setError("Informe o motivo da devolução.");
      return;
    }

    setReturnSaving(true);
    setMessage(null);
    setError(null);

    try {
      const signedAttachments = getAvulsaAttachmentFiles(returningItem.signed_attachment);
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
        signedAttachments.map((attachment) =>
          removeAttachmentFileSafely(attachment, "returned avulsa signed attachment"),
        ),
      );
      setItems((current) => current.filter((item) => item.id !== returningItem.id));
      setReturningItem(null);
      setReturnReason("");
      setMessage("Assinatura avulsa devolvida ao usuário.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao devolver assinatura avulsa.");
    } finally {
      setReturnSaving(false);
    }
  };

  const remove = async (item: AvulsaSignatureRow) => {
    if (!window.confirm("Excluir esta assinatura avulsa do controle?")) return;
    setActingId(item.id);
    setMessage(null);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("assinaturas_avulsas" as any)
        .update({ status: "excluido_admin" })
        .eq("id", item.id);

      if (updateError) throw new Error(updateError.message);
      await Promise.all([
        ...getAvulsaAttachmentFiles(item.admin_attachment).map((attachment) =>
          removeAttachmentFileSafely(attachment, "avulsa admin attachment"),
        ),
        ...getAvulsaAttachmentFiles(item.signed_attachment).map((attachment) =>
          removeAttachmentFileSafely(attachment, "avulsa signed attachment"),
        ),
      ]);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setMessage("Assinatura avulsa excluída do controle.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir assinatura avulsa.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Admin / Controle de assinaturas avulsas</p>
        <h2 className="text-2xl text-foreground">Controle de assinaturas avulsas</h2>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={tab === "pendentes" ? "default" : "outline"}
              onClick={() => setTab("pendentes")}
            >
              Pendentes ({counts.pendentes})
            </Button>
            <Button
              type="button"
              variant={tab === "assinadas" ? "default" : "outline"}
              onClick={() => setTab("assinadas")}
            >
              Assinadas ({counts.assinadas})
            </Button>
          </div>
          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Buscar por número, SIG, usuário, setor ou documento"
            />
          </label>
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
      ) : filteredItems.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhuma assinatura avulsa encontrada neste filtro.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-left font-normal">SIG</th>
                  <th className="px-3 py-2 text-left font-normal">Documento</th>
                  <th className="px-3 py-2 text-left font-normal">Usuário</th>
                  <th className="px-3 py-2 text-left font-normal">Setor</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isSigned = item.status === AVULSA_SIGNED_STATUS;
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {getAvulsaDisplayCode(item)}
                      </td>
                      <td className="px-3 py-2 text-foreground">{item.saida_codigo || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">{item.titulo}</div>
                        <div className="text-xs text-muted-foreground">
                          {getAvulsaAttachmentFiles(
                            isSigned ? item.signed_attachment : item.admin_attachment,
                          ).length || 1}{" "}
                          PDF(s)
                        </div>
                        {item.observacao ? (
                          <div className="text-xs text-muted-foreground">
                            Mensagem: {item.observacao}
                          </div>
                        ) : null}
                        {item.return_reason ? (
                          <div className="text-xs text-orange-700">
                            Motivo: {item.return_reason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-foreground">{item.solicitante}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.setor || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(isSigned ? item.signed_at || item.updated_at : item.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{getAvulsaStatusLabel(item.status)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
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
                            Ver PDF
                          </Button>
                          {isSigned ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2 text-orange-700"
                              disabled={actingId === item.id}
                              onClick={() => setReturningItem(item)}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Devolver
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 text-destructive"
                            disabled={actingId === item.id}
                            onClick={() => void remove(item)}
                          >
                            {actingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Excluir
                          </Button>
                        </div>
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
            <DialogTitle>Devolver assinatura avulsa</DialogTitle>
            <DialogDescription>
              Informe o motivo para o usuário ajustar e reenviar os PDFs assinados.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            placeholder="Descreva o motivo da devolução"
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
