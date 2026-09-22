import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Check,
  ChevronRight,
  FileSignature,
  GripVertical,
  Loader2,
  Send,
  Undo2,
  Upload,
  UserRound,
} from "lucide-react";
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
import { AVULSA_PENDING_STATUSES, getAvulsaDisplayCode, type AvulsaSignatureRow } from "@/lib/avulsa-signatures";
import { buildGlobalRequestCodes } from "@/lib/request-code";
import { getRequestOwnerCpfVariants, getRequestOwnerLocation } from "@/lib/request-owner";
import { getSelectedSharedRequesterProfile } from "@/lib/shared-sector-session";
import { getCurrentUserProfile, isSharedSectorProfile, type CurrentUserProfile } from "@/lib/user-profile";

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

type PendingSignatureGroup = {
  key: string;
  solicitante: string;
  setor: string;
  items: RequisicaoItem[];
};

const deletedRequestStatuses = new Set(["excluida_admin", "excluida_usuario"]);

function isDeletedRequest(request: Pick<RequisicaoItem, "status">) {
  return deletedRequestStatuses.has(request.status);
}

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
        label: "Aguardando assinatura da saída do SIG",
        className: "bg-orange-100 text-orange-800 border border-orange-200 font-normal",
      };
    case "aguardando_assinatura":
    case "aguardando_assinatura_requisicao":
      return {
        label: "Aguardando Assinatura do Solicitante",
        className: "bg-orange-100 text-orange-800 border border-orange-200 font-normal",
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
  if (isDeletedRequest(request)) return false;

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
  const [avulsasPendentes, setAvulsasPendentes] = useState<AvulsaSignatureRow[]>([]);
  const [hasOutputPending, setHasOutputPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // PDF Viewer Modal
  const [pdfModal, setPdfModal] = useState<PdfModalState>({
    open: false,
    url: null,
    title: "",
  });

  // Admin Actions State (Anexar saída do SIG & Devolver)
  const [attachingReq, setAttachingReq] = useState<RequisicaoItem | null>(null);
  const [saidaCodigoInput, setSaidaCodigoInput] = useState("");
  const [saidaDataInput, setSaidaDataInput] = useState(getTodayInputDate());
  const [stagedPdfFiles, setStagedPdfFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedGroupKey, setDraggedGroupKey] = useState<string | null>(null);
  const [signatureGroupOrder, setSignatureGroupOrder] = useState<string[]>([]);
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
            setAvulsasPendentes([]);
          }
          return;
        }
        const dashboardProfile = isSharedSectorProfile(userProfile)
          ? await getSelectedSharedRequesterProfile(userProfile)
          : userProfile;

        if (!dashboardProfile && isSharedSectorProfile(userProfile)) {
          navigate({ to: "/admin/selecionar-solicitante" });
          return;
        }

        if (active) {
          setProfile(dashboardProfile ?? userProfile);
          setIsAdmin(userProfile.is_admin === true);
        }

        const buildDashboardQuery = (selectColumns: string) => {
          let query = supabase
            .from("requisicoes")
            .select(selectColumns)
            .order("created_at", { ascending: true });

          if (!dashboardProfile.is_admin) {
            const cpfVariants = getRequestOwnerCpfVariants(dashboardProfile);
            const location = getRequestOwnerLocation(dashboardProfile);
            const name = dashboardProfile.nome?.trim() || "";

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

        if (userProfile.is_admin) {
          setAvulsasPendentes([]);
        } else {
          const { data: avulsasData, error: avulsasError } = await supabase
            .from("assinaturas_avulsas" as any)
            .select("*")
            .in("status", [...AVULSA_PENDING_STATUSES])
            .order("updated_at", { ascending: false });

          if (avulsasError) throw new Error(avulsasError.message);
          setAvulsasPendentes((avulsasData ?? []) as AvulsaSignatureRow[]);
        }

        const outputPending = items.some((req) => req.status === "aguardando_assinatura_saida");
        setHasOutputPending(outputPending);
      } catch (err) {
        if (active) {
          setRequisicoes([]);
          setAvulsasPendentes([]);
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

  // ADMIN ACTION: Abrir Modal Anexar saída do SIG
  const handleOpenAnexarSaida = (req: RequisicaoItem) => {
    setAttachingReq(req);
    setSaidaCodigoInput(req.saida_vinculada_codigo || "");
    setSaidaDataInput(getTodayInputDate());
    setStagedPdfFiles([]);
  };

  const handleConfirmAnexarSaida = async () => {
    if (!attachingReq) return;
    if (stagedPdfFiles.length === 0) {
      alert("Selecione ou arraste os PDFs da saída do SIG antes de enviar.");
      return;
    }

    const invalidFile = stagedPdfFiles.find(
      (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
    );

    if (invalidFile) {
      alert("Envie apenas arquivos PDF.");
      return;
    }

    setUploadingSaida(true);
    const linkedCode = saidaCodigoInput.trim() || null;
    const linkedDate = saidaDataInput.trim() || getTodayInputDate();
    const attachments: Array<{ fileName: string; storageBucket: string; storagePath: string; uploadedAt: string; kind: "output" }> = [];

    try {
      for (const file of stagedPdfFiles) {
        const safeName = sanitizeFileName(file.name) || "saida.pdf";
        const storagePath = `saidas/${attachingReq.id}/${Date.now()}-${attachments.length + 1}-${safeName}`;
        const attachment = {
          fileName: file.name,
          storageBucket: REQUISICOES_BUCKET,
          storagePath,
          uploadedAt: new Date().toISOString(),
          kind: "output" as const,
        };

        const { error: uploadError } = await supabase.storage
          .from(REQUISICOES_BUCKET)
          .upload(storagePath, file, {
            contentType: file.type || "application/pdf",
            upsert: true,
          });

        if (uploadError) throw new Error(uploadError.message);
        attachments.push(attachment);
      }

      const attachment = attachments.length === 1 ? attachments[0] : attachments;

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
      setStagedPdfFiles([]);
      setSaidaCodigoInput("");
      alert("Documento da saída do SIG enviado com sucesso!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao enviar documento da saída do SIG.");
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
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length > 0) {
      const invalidFile = droppedFiles.find(
        (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
      );
      if (invalidFile) {
        alert("Envie apenas arquivos no formato PDF.");
        return;
      }
      setStagedPdfFiles(droppedFiles);
    }
  };

  // ADMIN ACTION: Open Devolver Modal
  const handleOpenDevolucao = (req: RequisicaoItem) => {
    setDevolucaoReq(req);
    // Se a solicitação já estiver em estágio de saída do SIG ou tiver admin_attachment, padroniza opção como saída do SIG
    setDevolucaoTarget(req.status === "aguardando_assinatura_saida" ? "saida" : "requisicao");
    setMotivoDevolucao("");
  };

  // ADMIN ACTION: Devolver com Motivo (Solicitação vs Saída do SIG)
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
          ? "Documento de saída do SIG devolvido para o admin anexar novamente!"
          : "Solicitação devolvida para correção com sucesso!",
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao devolver solicitação.");
    } finally {
      setSavingDevolucao(false);
    }
  };

  const userName = profile?.nome || "Usuário";

  const activeRequisicoes = requisicoes.filter((r) => !isDeletedRequest(r));
  const currentMonthRequisicoes = activeRequisicoes.filter((r) => isCurrentMonth(r.data, r.created_at));
  const monthlyCount = currentMonthRequisicoes.length;

  const pendingRequests = activeRequisicoes.filter((r) => {
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

  const pendingTotalCount = pendingRequests.length + (isAdmin ? 0 : avulsasPendentes.length);
  const hasOnlyAvulsaPending = !isAdmin && pendingRequests.length === 0 && avulsasPendentes.length > 0;
  const hasAnyPending = pendingRequests.length > 0 || avulsasPendentes.length > 0;

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
        ? "Você tem solicitação devolvida para correção"
        : "Você tem solicitações devolvidas para correção";
    }

    if (hasOutputPending) {
      return "Você tem solicitação aguardando assinatura de saída do SIG";
    }

    if (hasOnlyAvulsaPending) {
      return avulsasPendentes.length === 1
        ? "Você tem assinatura avulsa aguardando assinatura"
        : "Você tem assinaturas avulsas aguardando assinatura";
    }

    if (!isAdmin && avulsasPendentes.length > 0) {
      return "Você tem solicitações e assinaturas avulsas pendentes";
    }

    return "Atenção, você precisa assinar suas solicitações para prosseguir";
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

    if (hasOnlyAvulsaPending) {
      return "Clique aqui para acessar suas assinaturas avulsas";
    }

    if (!isAdmin && avulsasPendentes.length > 0) {
      return "Clique aqui para acessar suas assinaturas pendentes";
    }

    return "Clique aqui para acessar suas assinaturas e assinar os documentos";
  };

  const getPendingActionLabel = (status: string) => {
    if (isAdmin) return "Atender Solicitação";
    if (status === "correcao_requisicao") return "Corrigir Solicitação";
    if (status === "aguardando_assinatura_saida") return "Assinar saída do SIG";
    return "Ver Assinatura";
  };

  const requestCodesMap = buildGlobalRequestCodes(
    activeRequisicoes.map((r) => ({
      id: r.id,
      saida_codigo: r.saida_codigo,
      data: r.data || null,
      created_at: r.created_at || new Date().toISOString(),
    })),
  );


  const pendingSignatureStatuses = new Set([
    "aguardando_assinatura",
    "aguardando_assinatura_requisicao",
    "aguardando_assinatura_saida",
    "correcao_requisicao",
  ]);

  const pendingSignatureGroups = requisicoes
    .filter((req) => !isDeletedRequest(req))
    .filter((req) => pendingSignatureStatuses.has(req.status))
    .reduce<PendingSignatureGroup[]>((groups, req) => {
      const solicitante = req.solicitante?.trim() || "Usuário sem nome";
      const setor = req.setor?.trim() || "Setor não informado";
      const key = `${solicitante.toLowerCase()}::${setor.toLowerCase()}`;
      const existingGroup = groups.find((group) => group.key === key);

      if (existingGroup) {
        existingGroup.items.push(req);
      } else {
        groups.push({ key, solicitante, setor, items: [req] });
      }

      return groups;
    }, []);

  const orderedSignatureGroups = [...pendingSignatureGroups].sort((a, b) => {
    const aIndex = signatureGroupOrder.indexOf(a.key);
    const bIndex = signatureGroupOrder.indexOf(b.key);

    if (aIndex !== -1 || bIndex !== -1) {
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    }

    return b.items.length - a.items.length;
  });

  const getSignatureStatusLabel = (status: string) => {
    if (status === "aguardando_assinatura_saida") return "Assinatura da saída do SIG";
    if (status === "correcao_requisicao") return "Correção pendente";
    return "Assinatura da Solicitação";
  };

  const handleSignatureGroupDrop = (targetKey: string) => {
    if (!draggedGroupKey || draggedGroupKey === targetKey) {
      setDraggedGroupKey(null);
      return;
    }

    const currentOrder = orderedSignatureGroups.map((group) => group.key);
    const fromIndex = currentOrder.indexOf(draggedGroupKey);
    const toIndex = currentOrder.indexOf(targetKey);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedGroupKey(null);
      return;
    }

    const nextOrder = [...currentOrder];
    const [movedKey] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, movedKey);
    setSignatureGroupOrder(nextOrder);
    setDraggedGroupKey(null);
  };

  return (
    <div className="space-y-6">
      {/* SAUDAÇÃO INICIAL */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          Olá, {userName}
        </h1>
        <p className="text-xs text-slate-500 mt-1 font-normal">
          Bem-vindo ao SOLICITE JÁ - Sistema Integrado de Gestão de Solicitações.
        </p>
      </div>

      {/* CARDS DE MÉTRICAS EM BRANCO (MÊS ATUAL) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-normal text-slate-500">Total de Solicitações (Mês Atual)</div>
          <div className="text-3xl font-normal tracking-tight text-slate-900 mt-2">
            {monthlyCount}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-normal text-slate-500">
            {pendingMetricLabel}
          </div>
          <div className="text-3xl font-normal tracking-tight text-slate-900 mt-2">
            {pendingTotalCount}
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
      ) : hasAnyPending ? (
        <button
          type="button"
          onClick={() => navigate({ to: hasOnlyAvulsaPending ? "/admin/assinaturas-avulsas" : pendingTargetUrl })}
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
                    Solicitação {reqCode} - {date}
                  </span>
                  <span className="underline text-orange-700 font-normal group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                    {getPendingActionLabel(req.status)}{" "}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              );
            })}
            {!isAdmin && avulsasPendentes.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-orange-900 font-normal"
              >
                <span>
                  Avulsa {getAvulsaDisplayCode(item)}{item.saida_codigo ? ` - SIG ${item.saida_codigo}` : ""}
                </span>
                <span className="underline text-orange-700 font-normal group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                  Assinar avulsa <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            ))}
          </div>
        </button>
      ) : (
        <div className="w-full p-5 rounded-2xl border border-emerald-200/80 bg-emerald-50 text-emerald-900 shadow-2xs space-y-1">
          <h3 className="text-sm font-semibold text-emerald-800">Tudo em dia</h3>
          <p className="text-xs text-emerald-700 font-normal">
            {isAdmin
              ? "Não há solicitações pendentes para atendimento no momento."
              : "Você não tem solicitações pendentes no momento."}
          </p>
        </div>
      )}

      {/* QUADRO DE ASSINATURAS PENDENTES POR SETOR/USUÁRIO */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Blocos de Assinaturas Pendentes</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              Organizado por setor e usuário. Arraste os blocos para priorizar o acompanhamento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin/minhas-assinaturas" })}
            className="text-xs font-normal text-emerald-600 hover:text-emerald-700 underline inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
          >
            Abrir Assinaturas <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {orderedSignatureGroups.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 font-normal border border-dashed border-slate-200 rounded-xl bg-slate-50/70">
            Nenhuma assinatura pendente no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {orderedSignatureGroups.map((group) => (
              <div
                key={group.key}
                draggable
                onDragStart={() => setDraggedGroupKey(group.key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleSignatureGroupDrop(group.key)}
                onDragEnd={() => setDraggedGroupKey(null)}
                className={`min-h-48 rounded-xl border p-4 transition-all cursor-grab active:cursor-grabbing ${
                  draggedGroupKey === group.key
                    ? "border-emerald-300 bg-emerald-50 shadow-sm opacity-80"
                    : "border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <UserRound className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{group.solicitante}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-normal">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{group.setor}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-normal text-emerald-700">
                      {group.items.length} pendente{group.items.length === 1 ? "" : "s"}
                    </span>
                    <GripVertical className="h-4 w-4 text-slate-300" />
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {group.items.map((req) => {
                    const reqCode = requestCodesMap.get(req.id) || req.id.substring(0, 8);
                    const dateDisplay = formatDisplayDate(req.data, req.created_at);
                    const linkedOutputCode = req.saida_vinculada_codigo?.trim();

                    return (
                      <button
                        key={req.id}
                        type="button"
                        onClick={() => navigate({ to: "/admin/minhas-assinaturas" })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-700">
                            <FileSignature className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">Solicitação {reqCode}</span>
                          </span>
                          {linkedOutputCode && (
                            <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                              SIG {linkedOutputCode}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] font-normal text-slate-500">
                          {getSignatureStatusLabel(req.status)}{dateDisplay ? ` · ${dateDisplay}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
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
            setStagedPdfFiles([]);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-800">
              Anexar documento da saída do SIG
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="saida_codigo_dash" className="text-xs text-slate-600 font-normal">
                  Número da saída do SIG
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
                  Data da saída do SIG
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
              <Label className="text-xs text-slate-600 font-normal">Arquivos PDF da saída do SIG</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  if (picked.length > 0) setStagedPdfFiles(picked);
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
                    : stagedPdfFiles[0]
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50"
                }`}
              >
                {stagedPdfFiles[0] ? (
                  <div className="flex items-center gap-2 text-emerald-800">
                    {/* V SIMPLES SEM FUNDO */}
                    <Check className="w-5 h-5 text-emerald-600 shrink-0 stroke-[2.5]" />
                    <span className="text-xs font-normal truncate max-w-64">
                      {stagedPdfFiles.length === 1 ? stagedPdfFiles[0].name : `${stagedPdfFiles.length} PDFs selecionados`}
                    </span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs text-slate-600 font-normal">
                      Arraste ou clique para selecionar os PDFs da saída do SIG
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
                setStagedPdfFiles([]);
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
              disabled={uploadingSaida || stagedPdfFiles.length === 0}
            >
              {uploadingSaida ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Enviar saída do SIG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL ADMIN: DEVOLVER COM SELEÇÃO (REQUISIÇÃO OU SAÍDA) E MOTIVO */}
      <Dialog
        open={Boolean(devolucaoReq)}
        onOpenChange={(open) => {
          if (!open) setDevolucaoReq(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-800">
              Devolver solicitação
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
                  Devolver Solicitação
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
                  Devolver saída do SIG
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
                    ? "Descreva o motivo para o admin anexar a saída do SIG novamente..."
                    : "Descreva o motivo para que o solicitante possa corrigir a solicitação..."
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
