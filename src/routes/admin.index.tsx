import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, FileText, Loader2, Send, Undo2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSignedAttachmentPayload,
  getAttachmentFile,
  getOutputSignedAttachment,
  getRequestSignedAttachment,
} from "@/lib/attachments";
import {
  isMissingLinkedOutputDateColumnError,
  omitLinkedOutputDateFields,
  withLinkedOutputDateFallback,
} from "@/lib/linked-output-date";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import { getRequestOwnerCpfVariants, getRequestOwnerLocation } from "@/lib/request-owner";
import { getCurrentUserProfile, type CurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

const REQUISICOES_BUCKET = "requisicoes";
const dashboardRequestsSelectWithLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,saida_vinculada_data,solicitante,solicitante_cpf,setor,data,created_at,status,signed_attachment,admin_attachment";
const dashboardRequestsSelectWithoutLinkedOutputDate =
  "id,saida_codigo,saida_vinculada_codigo,solicitante,solicitante_cpf,setor,data,created_at,status,signed_attachment,admin_attachment";

type RequisicaoItem = {
  id: string;
  saida_codigo: string | null;
  saida_vinculada_codigo?: string | null;
  saida_vinculada_data?: string | null;
  solicitante?: string | null;
  solicitante_cpf?: string | null;
  setor?: string | null;
  data?: string | null;
  created_at?: string;
  status: string;
  signed_attachment: unknown;
  admin_attachment: unknown;
};

type PdfModalState = {
  open: boolean;
  url: string | null;
  title: string;
};

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getTodayInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(rawDate?: string | null, rawCreatedAt?: string) {
  const value = rawDate || rawCreatedAt;
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }
  } catch {
    // ignore
  }
  return value;
}

function isCurrentMonth(rawDate?: string | null, rawCreatedAt?: string) {
  const value = rawDate || rawCreatedAt;
  if (!value) return false;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const parts = value.split("/");
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return month === currentMonth && year === currentYear;
  }

  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }
  } catch {
    // ignore
  }
  return false;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "aguardando_assinatura_saida":
      return {
        label: "Aguardando Assinatura de Saída",
        className: "bg-orange-100 text-orange-800 border border-orange-200 font-normal",
      };
    case "aguardando_assinatura":
    case "aguardando_assinatura_requisicao":
      return {
        label: "Aguardando Assinatura do Solicitante",
        className: "bg-amber-100 text-amber-800 border border-amber-200 font-normal",
      };
    case "correcao_requisicao":
      return {
        label: "Devolvida para Correção",
        className: "bg-orange-100 text-orange-800 border border-orange-200 font-normal",
      };
    case "recebido":
    case "requisicao_assinada":
      return {
        label: "Enviada / Em Separação",
        className: "bg-emerald-100 text-emerald-800 border border-emerald-200 font-normal",
      };
    case "concluido":
      return {
        label: "Concluído",
        className: "bg-blue-100 text-blue-800 border border-blue-200 font-normal",
      };
    default:
      return {
        label: "Enviada",
        className: "bg-slate-100 text-slate-700 border border-slate-200 font-normal",
      };
  }
}

function hasAdminOutputDocument(request: RequisicaoItem) {
  return Boolean(
    getOutputSignedAttachment(request.signed_attachment, request.status) ||
      getAttachmentFile(request.admin_attachment),
  );
}

function hasAdminRequestSigned(request: RequisicaoItem) {
  return Boolean(getRequestSignedAttachment(request.signed_attachment, request.status));
}

function needsAdminOutput(request: RequisicaoItem) {
  return (
    !hasAdminOutputDocument(request) &&
    (request.status === "recebido" ||
      request.status === "requisicao_assinada" ||
      hasAdminRequestSigned(request))
  );
}
function AdminHome() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [requisicoes, setRequisicoes] = useState<RequisicaoItem[]>([]);
  const [hasOutputPending, setHasOutputPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // PDF Viewer Modal
  const [pdfModal, setPdfModal] = useState<PdfModalState>({
    open: false,
    url: null,
    title: "",
  });

  // Admin Actions State (Anexar Saída & Devolver)
  const [attachingReq, setAttachingReq] = useState<RequisicaoItem | null>(null);
  const [saidaCodigoInput, setSaidaCodigoInput] = useState("");
  const [saidaDataInput, setSaidaDataInput] = useState(getTodayInputDate());
  const [stagedPdfFile, setStagedPdfFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingSaida, setUploadingSaida] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [devolucaoReq, setDevolucaoReq] = useState<RequisicaoItem | null>(null);
  const [devolucaoTarget, setDevolucaoTarget] = useState<"requisicao" | "saida">("requisicao");
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [savingDevolucao, setSavingDevolucao] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      setLoading(true);
      setLoadError(null);

      try {
        const { profile: userProfile } = await getCurrentUserProfile();

        if (!userProfile) {
          if (active) {
            setIsAdmin(false);
            setRequisicoes([]);
          }
          return;
        }

        if (active) {
          setProfile(userProfile);
          setIsAdmin(userProfile.is_admin === true);
        }

        const buildDashboardQuery = (selectColumns: string) => {
          let query = supabase
            .from("requisicoes")
            .select(selectColumns)
            .order("created_at", { ascending: true });

          if (!userProfile.is_admin) {
            const cpfVariants = getRequestOwnerCpfVariants(userProfile);
            const location = getRequestOwnerLocation(userProfile);
            const name = userProfile.nome?.trim() || "";

            if (cpfVariants.length > 0) {
              query = query.in("solicitante_cpf", cpfVariants);
            } else if (name && location) {
              query = query.eq("solicitante", name).eq("setor", location);
            }
          }

          return query;
        };

        let { data, error } = await buildDashboardQuery(dashboardRequestsSelectWithLinkedOutputDate);

        if (error && isMissingLinkedOutputDateColumnError(error.message)) {
          const fallbackResult = await buildDashboardQuery(dashboardRequestsSelectWithoutLinkedOutputDate);
          data = fallbackResult.data;
          error = fallbackResult.error;
        }

        if (error) throw new Error(error.message);
        if (!active) return;

        const items = withLinkedOutputDateFallback(data) as RequisicaoItem[];
        setRequisicoes(items);

        const outputPending = items.some((req) => req.status === "aguardando_assinatura_saida");
        setHasOutputPending(outputPending);
      } catch (err) {
        if (active) {
          setRequisicoes([]);
          setHasOutputPending(false);
          setLoadError(err instanceof Error ? err.message : "Erro ao carregar informações do dashboard.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, []);

  const openPdfUrl = (url: string, title: string) => {
    setPdfModal({
      open: true,
      url,
      title,
    });
  };

  const handleFetchAndOpenPdf = async (
    attachment: { storageBucket?: string; storagePath?: string } | null,
    title: string,
  ) => {
    if (!attachment?.storageBucket || !attachment?.storagePath) {
      alert("Nenhum PDF disponível para visualização.");
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(attachment.storageBucket)
        .createSignedUrl(attachment.storagePath, 3600);

      if (error) throw new Error(error.message);
      if (data?.signedUrl) {
        openPdfUrl(data.signedUrl, title);
      }
    } catch {
      alert("Erro ao carregar o PDF.");
    }
  };

  // ADMIN ACTION: Abrir Modal Anexar Saída
  const handleOpenAnexarSaida = (req: RequisicaoItem) => {
    setAttachingReq(req);
    setSaidaCodigoInput(req.saida_vinculada_codigo || "");
    setSaidaDataInput(getTodayInputDate());
    setStagedPdfFile(null);
  };

  const handleConfirmAnexarSaida = async () => {
    if (!attachingReq) return;
    if (!stagedPdfFile) {
      alert("Selecione ou arraste um arquivo PDF de saída antes de enviar.");
      return;
    }

    if (
      stagedPdfFile.type !== "application/pdf" &&
      !stagedPdfFile.name.toLowerCase().endsWith(".pdf")
    ) {
      alert("Envie apenas arquivo PDF.");
      return;
    }

    setUploadingSaida(true);
    const safeName = sanitizeFileName(stagedPdfFile.name) || "saida.pdf";
    const storagePath = `saidas/${attachingReq.id}/${Date.now()}-${safeName}`;
    const linkedCode = saidaCodigoInput.trim() || null;
    const linkedDate = saidaDataInput.trim() || getTodayInputDate();

    const attachment = {
      fileName: stagedPdfFile.name,
      storageBucket: REQUISICOES_BUCKET,
      storagePath,
      uploadedAt: new Date().toISOString(),
      kind: "output" as const,
      outputCode: linkedCode,
      outputDate: linkedDate,
    };

    try {
      const { error: uploadError } = await supabase.storage
        .from(REQUISICOES_BUCKET)
        .upload(storagePath, stagedPdfFile, {
          contentType: stagedPdfFile.type || "application/pdf",
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);

      const payload = {
        admin_attachment: attachment,
        saida_vinculada_codigo: linkedCode,
        saida_vinculada_data: linkedDate,
        status: "aguardando_assinatura_saida",
        return_reason: null,
        return_target: null,
        returned_at: null,
      };

      let { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", attachingReq.id);

      if (updateError && isMissingLinkedOutputDateColumnError(updateError.message)) {
        const fallbackUpdate = await supabase
          .from("requisicoes")
          .update(omitLinkedOutputDateFields(payload))
          .eq("id", attachingReq.id);

        updateError = fallbackUpdate.error;
      }

      if (updateError) throw new Error(updateError.message);

      setRequisicoes((prev) =>
        prev.map((item) =>
          item.id === attachingReq.id
            ? {
                ...item,
                saida_vinculada_codigo: linkedCode,
                saida_vinculada_data: linkedDate,
                status: "aguardando_assinatura_saida",
                admin_attachment: attachment,
              }
            : item,
        ),
      );

      setAttachingReq(null);
      setStagedPdfFile(null);
      setSaidaCodigoInput("");
      alert("Documento de saída enviado com sucesso!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao enviar documento de saída.");
    } finally {
      setUploadingSaida(false);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (
        droppedFile.type === "application/pdf" ||
        droppedFile.name.toLowerCase().endsWith(".pdf")
      ) {
        setStagedPdfFile(droppedFile);
      } else {
        alert("Envie apenas arquivos no formato PDF.");
      }
    }
  };

  // ADMIN ACTION: Open Devolver Modal
  const handleOpenDevolucao = (req: RequisicaoItem) => {
    setDevolucaoReq(req);
    // Se a requisição já estiver em estágio de saída ou tiver admin_attachment, padroniza opção como saída
    setDevolucaoTarget(req.status === "aguardando_assinatura_saida" ? "saida" : "requisicao");
    setMotivoDevolucao("");
  };

  // ADMIN ACTION: Devolver com Motivo (Requisição vs Saída)
  const handleConfirmDevolucao = async () => {
    if (!devolucaoReq) return;
    const reason = motivoDevolucao.trim();
    if (!reason) {
      alert("Por favor, informe o motivo da devolução.");
      return;
    }

    setSavingDevolucao(true);

    try {
      const isSaidaReturn = devolucaoTarget === "saida";

      const updatedSignedAttachment = isSaidaReturn
        ? buildSignedAttachmentPayload(devolucaoReq.signed_attachment, { output: null })
        : null;

      const payload = {
        status: isSaidaReturn ? "requisicao_assinada" : "correcao_requisicao",
        signed_attachment: updatedSignedAttachment,
        admin_attachment: null,
        return_reason: reason,
        return_target: isSaidaReturn ? "saida" : "requisicao",
        returned_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", devolucaoReq.id);

      if (updateError) throw new Error(updateError.message);

      setRequisicoes((prev) =>
        prev.map((item) =>
          item.id === devolucaoReq.id
            ? {
                ...item,
                status: isSaidaReturn ? "requisicao_assinada" : "correcao_requisicao",
                signed_attachment: updatedSignedAttachment,
                admin_attachment: null,
              }
            : item,
        ),
      );

      setDevolucaoReq(null);
      setMotivoDevolucao("");
      alert(
        isSaidaReturn
          ? "Documento de saída devolvido para o admin anexar novamente!"
          : "Requisição devolvida para correção com sucesso!",
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao devolver requisição.");
    } finally {
      setSavingDevolucao(false);
    }
  };

  const userName = profile?.nome || "Usuário";

  const currentMonthRequisicoes = requisicoes.filter((r) => isCurrentMonth(r.data, r.created_at));
  const monthlyCount = currentMonthRequisicoes.length;

  const pendingRequests = requisicoes.filter((r) => {
    if (isAdmin) {
      return needsAdminOutput(r);
    }
    return [
      "aguardando_assinatura",
      "aguardando_assinatura_requisicao",
      "aguardando_assinatura_saida",
      "correcao_requisicao",
    ].includes(r.status);
  });

  const correctionPendingRequests = pendingRequests.filter(
    (req) => req.status === "correcao_requisicao",
  );
  const hasCorrectionPending = !isAdmin && correctionPendingRequests.length > 0;
  const pendingTargetUrl = isAdmin ? "/admin/solicitacoes" : "/admin/minhas-assinaturas";

  const pendingMetricLabel = isAdmin
    ? "Solicitações Pendentes para Atendimento"
    : hasCorrectionPending
      ? "Pendentes de Correção"
      : "Pendentes de Assinatura";

  const getPendingBannerTitle = () => {
    if (isAdmin) {
      return `Você tem ${pendingRequests.length} ${
        pendingRequests.length === 1
          ? "solicitação pendente para atendimento"
          : "solicitações pendentes para atendimento"
      }`;
    }

    if (hasCorrectionPending) {
      return correctionPendingRequests.length === 1
        ? "Você tem requisição devolvida para correção"
        : "Você tem requisições devolvidas para correção";
    }

    if (hasOutputPending) {
      return "Você tem requisição aguardando assinatura de saída";
    }

    return "Atenção, você precisa assinar suas requisições para prosseguir";
  };

  const getPendingBannerDescription = () => {
    if (isAdmin) {
      return "Clique aqui para acessar e gerenciar as solicitações pendentes de atendimento";
    }

    if (hasCorrectionPending) {
      return correctionPendingRequests.length === pendingRequests.length
        ? "Clique aqui para abrir as opções de editar ou excluir"
        : "Clique aqui para corrigir devoluções e assinar documentos pendentes";
    }

    return "Clique aqui para acessar suas assinaturas e assinar os documentos";
  };

  const getPendingActionLabel = (status: string) => {
    if (isAdmin) return "Atender Requisição";
    if (status === "correcao_requisicao") return "Corrigir Requisição";
    if (status === "aguardando_assinatura_saida") return "Assinar Saída";
    return "Ver Assinatura";
  };

  const requestCodesMap = buildGlobalRequestCodes(
    requisicoes.map((r) => ({
      id: r.id,
      saida_codigo: r.saida_codigo,
      data: r.data || null,
      created_at: r.created_at || new Date().toISOString(),
    })),
  );

  const signedByUserStatuses = new Set([
    "recebido",
    "requisicao_assinada",
    "aguardando_assinatura_saida",
    "concluido",
  ]);

  // Mostrar apenas requisições já enviadas/assinadas; devolvidas ficam no aviso de pendência.
  const requisicoesForDisplay = currentMonthRequisicoes.filter((req) =>
    signedByUserStatuses.has(req.status),
  );
  const sortedRequisicoesForDisplay = [...requisicoesForDisplay].reverse();

  return (
    <div className="space-y-6">
      {/* SAUDAÇÃO INICIAL */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          Olá, {userName}
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-normal">
          Bem-vindo ao SOLICITE JÁ - Sistema Integrado de Gestão de Requisições.
        </p>
      </div>

      {/* CARDS DE MÉTRICAS EM BRANCO (MÊS ATUAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-normal text-slate-500">Total de Requisições (Mês Atual)</div>
          <div className="text-3xl font-normal tracking-tight text-slate-900 mt-2">
            {monthlyCount}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-normal text-slate-500">
            {pendingMetricLabel}
          </div>
          <div className="text-3xl font-normal tracking-tight text-slate-900 mt-2">
            {pendingRequests.length}
          </div>
        </div>
      </div>

      {/* BANNER DE AVISO (VERMELHO CLARO SE HOUVER PENDÊNCIAS COM NÚMERO E DATA) */}
      {loading ? (
        <Card className="flex items-center gap-2 p-6 rounded-2xl border-slate-200 bg-white text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          Carregando avisos...
        </Card>
      ) : loadError ? (
        <Card className="p-6 rounded-2xl border-destructive/40 bg-destructive/10 text-destructive font-medium">
          {loadError}
        </Card>
      ) : pendingRequests.length > 0 ? (
        <button
          type="button"
          onClick={() => navigate({ to: pendingTargetUrl })}
          className="group w-full text-left p-5 rounded-2xl border border-orange-200/90 bg-orange-50 text-orange-900 shadow-2xs hover:bg-orange-100/80 transition-all cursor-pointer space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-orange-800">
                {getPendingBannerTitle()}
              </h3>
              <p className="text-xs text-orange-700 mt-0.5 font-normal">
                {getPendingBannerDescription()}
              </p>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-orange-200/70 text-xs font-normal">
            {pendingRequests.map((req) => {
              const reqCode = requestCodesMap.get(req.id) || req.id.substring(0, 8);
              const date = formatDisplayDate(req.data, req.created_at);
              return (
                <div
                  key={req.id}
                  className="flex items-center justify-between text-orange-900 font-normal"
                >
                  <span>
                    Requisição {reqCode} - {date}
                  </span>
                  <span className="underline text-orange-700 font-normal group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                    {getPendingActionLabel(req.status)}{" "}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              );
            })}
          </div>
        </button>
      ) : (
        <div className="w-full p-5 rounded-2xl border border-emerald-200/80 bg-emerald-50 text-emerald-900 shadow-2xs space-y-1">
          <h3 className="text-sm font-semibold text-emerald-800">Tudo em dia</h3>
          <p className="text-xs text-emerald-700 font-normal">
            {isAdmin
              ? "Não há solicitações pendentes para atendimento no momento."
              : "Você não tem requisições pendentes no momento."}
          </p>
        </div>
      )}

      {/* SEÇÃO INFERIOR: ÚLTIMAS REQUISIÇÕES (MÊS ATUAL APENAS) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Últimas Requisições (Mês Atual)</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              Acompanhamento de status e envio de saída do almoxarifado
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              navigate({ to: isAdmin ? "/admin/solicitacoes" : "/admin/minhas-requisicoes" })
            }
            className="text-xs font-normal text-emerald-600 hover:text-emerald-700 underline inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            Ver Todas as Requisições <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          {sortedRequisicoesForDisplay.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 font-normal">
              Nenhuma requisição realizada no mês atual.
            </div>
          ) : (
            sortedRequisicoesForDisplay.map((req) => {
              const badge = getStatusBadge(req.status);
              const dateDisplay = formatDisplayDate(req.data, req.created_at);
              const reqCode = requestCodesMap.get(req.id) || req.id.substring(0, 8);

              const linkedOutputCode = req.saida_vinculada_codigo?.trim() || "";
              const showSaidaCode = Boolean(linkedOutputCode);

              const reqAttachment =
                getRequestSignedAttachment(req.signed_attachment, req.status) ||
                (req.admin_attachment as { storageBucket?: string; storagePath?: string } | null);

              const outputAttachment = getOutputSignedAttachment(req.signed_attachment, req.status);

              // ADMIN SÓ PODE ANEXAR SAÍDA QUANDO O USUÁRIO JÁ CRIOU E ASSINOU A REQUIÇÃO
              const isUserSigned =
                req.status === "recebido" ||
                req.status === "requisicao_assinada" ||
                req.status === "aguardando_assinatura_saida" ||
                req.status === "concluido";

              return (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200/70 gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-normal text-slate-700">
                        Requisição {reqCode}
                      </span>
                      {showSaidaCode && (
                        <span className="text-xs font-normal text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          Saída {linkedOutputCode}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-normal">
                      Data: {dateDisplay || "—"} | Setor: {req.setor || "Almoxarifado"}
                    </div>
                  </div>

                  {/* AÇÕES DIRETA NA LINHA */}
                  <div className="flex flex-col gap-1.5 self-end sm:self-auto min-w-44">
                    {/* VISUALIZAÇÃO DE PDF (VER) */}
                    {reqAttachment && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-xl text-[11px] font-normal cursor-pointer border-slate-200 hover:bg-slate-100 justify-start"
                        onClick={() =>
                          void handleFetchAndOpenPdf(
                            reqAttachment,
                            `PDF da Requisição - Requisição ${reqCode}`,
                          )
                        }
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Ver PDF Requisição
                      </Button>
                    )}

                    {outputAttachment && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-xl text-[11px] font-normal cursor-pointer border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-800 justify-start"
                        onClick={() =>
                          void handleFetchAndOpenPdf(
                            outputAttachment,
                            `PDF da Saída - Saída ${req.saida_codigo || reqCode}`,
                          )
                        }
                      >
                        <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Ver PDF Saída
                      </Button>
                    )}

                    {/* AÇÕES EXCLUSIVAS DE ADMIN: ANEXAR SAÍDA E DEVOLVER */}
                    {isAdmin && isUserSigned && (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200/60">
                        <Button
                            type="button"
                            size="sm"
                            className="flex-1 gap-1 rounded-xl text-[11px] font-normal bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            onClick={() => handleOpenAnexarSaida(req)}
                          >
                            <Send className="w-3 h-3" />
                            Anexar Saída
                          </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1 rounded-xl text-[11px] font-normal border-orange-200 text-orange-700 hover:bg-orange-50 cursor-pointer"
                          onClick={() => handleOpenDevolucao(req)}
                        >
                          <Undo2 className="w-3 h-3 text-orange-500" />
                          Devolver
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* MODAL DE VISUALIZAÇÃO DE PDF */}
      <Dialog
        open={pdfModal.open}
        onOpenChange={(open) => {
          if (!open)
            setPdfModal({
              open: false,
              url: null,
              title: "",
            });
        }}
      >
        <DialogContent className="max-w-4xl h-[85vh] p-4 flex flex-col rounded-2xl">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-sm font-normal text-slate-800">
              {pdfModal.title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 w-full h-full min-h-0 bg-slate-100 rounded-xl overflow-hidden mt-2">
            {pdfModal.url ? (
              <iframe
                src={pdfModal.url}
                className="w-full h-full border-none"
                title="Visualizador de PDF de Controle"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-500 font-normal">
                Carregando PDF de controle...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL ADMIN: ANEXAR SAÍDA DIRETO (COM ARRASTAR/SOLTAR, V SEM FUNDO, NÚMERO E DATA DA SAÍDA) */}
      <Dialog
        open={Boolean(attachingReq)}
        onOpenChange={(open) => {
          if (!open) {
            setAttachingReq(null);
            setStagedPdfFile(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-800">
              Anexar Documento de Saída
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="saida_codigo_dash" className="text-xs text-slate-600 font-normal">
                  Número da Saída
                </Label>
                <Input
                  id="saida_codigo_dash"
                  placeholder="Ex: 00334"
                  value={saidaCodigoInput}
                  onChange={(e) => setSaidaCodigoInput(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="saida_data_dash" className="text-xs text-slate-600 font-normal">
                  Data da Saída
                </Label>
                <Input
                  id="saida_data_dash"
                  type="date"
                  value={saidaDataInput}
                  onChange={(e) => setSaidaDataInput(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>
            </div>

            {/* ÁREA DE DRAG & DROP DO PDF */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-normal">Arquivo PDF de Saída</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) setStagedPdfFile(picked);
                }}
              />

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-5 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-50/80"
                    : stagedPdfFile
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50"
                }`}
              >
                {stagedPdfFile ? (
                  <div className="flex items-center gap-2 text-emerald-800">
                    {/* V SIMPLES SEM FUNDO */}
                    <Check className="w-5 h-5 text-emerald-600 shrink-0 stroke-[2.5]" />
                    <span className="text-xs font-normal truncate max-w-64">
                      {stagedPdfFile.name}
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs text-slate-600 font-normal">
                      Arraste ou clique para selecionar o PDF de Saída
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => {
                setAttachingReq(null);
                setStagedPdfFile(null);
              }}
              disabled={uploadingSaida}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
              onClick={() => void handleConfirmAnexarSaida()}
              disabled={uploadingSaida || !stagedPdfFile}
            >
              {uploadingSaida ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Enviar Documento de Saída
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL ADMIN: DEVOLVER COM SELEÇÃO (REQUIÇÃO OU SAÍDA) E MOTIVO */}
      <Dialog
        open={Boolean(devolucaoReq)}
        onOpenChange={(open) => {
          if (!open) setDevolucaoReq(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-800">
              Devolver requisição
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600 font-normal">O que deseja devolver?</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={devolucaoTarget === "requisicao" ? "default" : "outline"}
                  className={`text-xs rounded-xl ${
                    devolucaoTarget === "requisicao"
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "border-slate-200 text-slate-700"
                  }`}
                  onClick={() => setDevolucaoTarget("requisicao")}
                >
                  Devolver Requisição
                </Button>
                <Button
                  type="button"
                  variant={devolucaoTarget === "saida" ? "default" : "outline"}
                  className={`text-xs rounded-xl ${
                    devolucaoTarget === "saida"
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : "border-slate-200 text-slate-700"
                  }`}
                  onClick={() => setDevolucaoTarget("saida")}
                >
                  Devolver Saída
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo_devolucao_dash" className="text-xs text-slate-600 font-normal">
                Motivo da Devolução
              </Label>
              <Textarea
                id="motivo_devolucao_dash"
                rows={3}
                placeholder={
                  devolucaoTarget === "saida"
                    ? "Descreva o motivo para o admin anexar a saída novamente..."
                    : "Descreva o motivo para que o solicitante possa corrigir a requisição..."
                }
                value={motivoDevolucao}
                onChange={(e) => setMotivoDevolucao(e.target.value)}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => setDevolucaoReq(null)}
              disabled={savingDevolucao}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-xl text-xs bg-orange-500 hover:bg-orange-600 text-white font-semibold"
              onClick={() => void handleConfirmDevolucao()}
              disabled={savingDevolucao}
            >
              {savingDevolucao ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Undo2 className="w-3.5 h-3.5" />
              )}
              Confirmar Devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
