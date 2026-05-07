import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
  removeAttachmentFile,
  type AttachmentFile,
} from "@/lib/attachments";
import { REQUISICOES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import type { RequestPdfItem } from "@/lib/request-pdf";

export const Route = createFileRoute("/admin/solicitacoes")({
  component: Solicitacoes,
});

interface Requisicao {
  id: string;
  saida_codigo: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  data: string | null;
  created_at: string;
  status: string;
  items: RequestPdfItem[] | null;
  signed_attachment: unknown;
  admin_attachment: unknown;
  displaySetor?: string;
}

function hasRequestSigned(request: Requisicao) {
  return Boolean(getRequestSignedAttachment(request.signed_attachment, request.status));
}

function hasOutputDocument(request: Requisicao) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
}

function needsAdminOutput(request: Requisicao) {
  return !hasOutputDocument(request) && (
    request.status === "recebido" ||
    request.status === "requisicao_assinada" ||
    hasRequestSigned(request)
  );
}

function Solicitacoes() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/solicitacoes";
  const [data, setData] = useState<Requisicao[]>();
  const [codeByRequestId, setCodeByRequestId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRequests() {
      setLoading(true);
      setError(null);

      const [pendingResult, allResult] = await Promise.all([
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,setor,solicitante,solicitante_cpf,data,created_at,status,items,signed_attachment,admin_attachment")
          .in("status", ["recebido", "requisicao_assinada", "concluido", "aguardando_assinatura_saida"])
          .order("created_at", { ascending: false }),
        supabase
          .from("requisicoes")
          .select("id,saida_codigo,data,created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!active) return;

      if (pendingResult.error || allResult.error) {
        setError(pendingResult.error?.message || allResult.error?.message || "Erro ao carregar solicitações.");
      } else {
        const requests = (pendingResult.data ?? []) as Requisicao[];
        const cpfs = Array.from(
          new Set(
            requests
              .map((request) => request.solicitante_cpf?.trim())
              .filter((cpf): cpf is string => Boolean(cpf)),
          ),
        );
        const usersByCpf = new Map<string, { setor: string | null; unidade_nome: string | null }>();

        if (cpfs.length > 0) {
          const { data: usersResult, error: usersError } = await supabase
            .from("usuarios")
            .select("cpf,setor,unidade_nome")
            .in("cpf", cpfs);

          if (usersError) {
            setError(usersError.message);
            setLoading(false);
            return;
          }

          (usersResult ?? []).forEach((user) => {
            if (user.cpf) {
              usersByCpf.set(user.cpf, {
                setor: user.setor ?? null,
                unidade_nome: user.unidade_nome ?? null,
              });
            }
          });
        }

        const pendingOutputRequests = requests.filter(needsAdminOutput);

        setData(
          pendingOutputRequests.map((request) => ({
            ...request,
            status: "recebido",
            displaySetor:
              request.setor?.trim() ||
              usersByCpf.get(request.solicitante_cpf?.trim() || "")?.unidade_nome?.trim() ||
              usersByCpf.get(request.solicitante_cpf?.trim() || "")?.setor?.trim() ||
              "Sem setor",
          })),
        );
        setCodeByRequestId(buildGlobalRequestCodes((allResult.data ?? []) as Requisicao[]));
      }

      setLoading(false);
    }

    loadRequests();

    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Requisicao[]>();
    (data ?? []).forEach((r) => {
      const key = r.displaySetor?.trim() || "Sem setor";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  if (isChildRoute) {
    return <Outlet />;
  }

  const selectedRequests = selected
    ? grouped.find(([setor]) => setor === selected)?.[1] ?? []
    : [];

  const handleOutputUpload = async (request: Requisicao, file: File | undefined) => {
    if (!file) return;

    setUploadMessage(null);

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Envie apenas arquivo PDF.");
      return;
    }

    const code = request.saida_codigo || codeByRequestId.get(request.id) || request.id;
    const safeName = sanitizeFileName(file.name) || "documento-saida.pdf";
    const storagePath = `saidas/${request.id}/${Date.now()}-${safeName}`;
    const attachment = {
      fileName: file.name,
      storageBucket: REQUISICOES_BUCKET,
      storagePath,
      uploadedAt: new Date().toISOString(),
      kind: "output" as const,
    };

    setUploadingId(request.id);

    try {
      const previousAdminAttachment = getAttachmentFile(request.admin_attachment) as AttachmentFile | null;

      const { error: uploadError } = await supabase.storage
        .from(REQUISICOES_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from("requisicoes")
        .update({
          admin_attachment: attachment,
          saida_codigo: request.saida_codigo || code,
          status: "aguardando_assinatura_saida",
        })
        .eq("id", request.id);

      if (updateError) throw new Error(updateError.message);

      await removeAttachmentFile(previousAdminAttachment);

      setData((current) => current?.filter((item) => item.id !== request.id));
      setUploadMessage("Documento de saída enviado.");
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : "Erro ao enviar documento de saída.");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Início / Solicitações</p>
        <h2 className="text-2xl text-foreground">Solicitações Pendentes</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : grouped.length === 0 ? (
        <Card className="p-6 text-muted-foreground">Nenhuma solicitação pendente.</Card>
      ) : selected ? (
        <Card className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Local selecionado</p>
              <p className="text-lg text-foreground">{selected}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>

          {uploadMessage && (
            <p className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {uploadMessage}
            </p>
          )}

          <div className="rounded-md overflow-x-auto border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Solicitante</th>
                  <th className="px-3 py-2 text-left font-normal">Data</th>
                  <th className="px-3 py-2 text-left font-normal">Número</th>
                  <th className="px-3 py-2 text-left font-normal">Documento de saída</th>
                  <th className="px-3 py-2 text-right font-normal">PDF</th>
                </tr>
              </thead>
              <tbody>
                {selectedRequests.map((r) => {
                  const code = r.saida_codigo || codeByRequestId.get(r.id) || "-";
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{r.solicitante || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.data || "-"}</td>
                      <td className="px-3 py-2 text-foreground">{code}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {getAttachmentFile(r.admin_attachment) ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              Enviado
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pendente</span>
                          )}
                          <input
                            id={`saida-${r.id}`}
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={uploadingId === r.id}
                            onChange={(event) => {
                              void handleOutputUpload(r, event.target.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={uploadingId === r.id}
                            onClick={() => document.getElementById(`saida-${r.id}`)?.click()}
                          >
                            {uploadingId === r.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {getAttachmentFile(r.admin_attachment) ? "Trocar" : "Enviar PDF"}
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            navigate({
                              to: "/admin/solicitacoes/$requisicaoId/pdf",
                              params: { requisicaoId: r.id },
                            })
                          }
                        >
                          <FileText className="h-4 w-4" />
                          Ver PDF
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <Card className="bg-muted/30 p-6">
            <p className="text-sm text-muted-foreground">Primeiro passo</p>
            <p className="text-lg text-foreground">Escolha o local para conferir os PDFs</p>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {grouped.map(([setor, items]) => (
              <button
                key={setor}
                type="button"
                onClick={() => setSelected(setor)}
                className="rounded-md border-l-4 border-primary/60 bg-card p-4 text-left transition-colors hover:bg-accent/50"
              >
                <p className="text-foreground">{setor}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {items.length} {items.length === 1 ? "registro" : "registros"}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
