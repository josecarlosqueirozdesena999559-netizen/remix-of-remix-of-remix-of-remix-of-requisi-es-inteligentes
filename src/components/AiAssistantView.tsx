import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { ActiveTab, Commitment, Contract, Creditor, ServiceNote } from "../types";
import { PROGRAMS_BY_ALLOCATION } from "./CommitmentsView";
import { getSupabaseConfig } from "../lib/supabase";

type ChatRole = "assistant" | "user";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

interface AttachedFile {
  id: string;
  filename: string;
  fileData: string;
  size: number;
}

type AiAction =
  | {
      type: "create_contract";
      contractNum: string;
      creditor: string;
      object: string;
      startDate?: string;
      endDate?: string;
      totalValue?: number;
      category?: string;
    }
  | {
      type: "create_commitment";
      number: string;
      budgetAllocation: string;
      program: string;
      value: number;
      balance?: number;
      description?: string;
    }
  | {
      type: "create_note";
      noteNumber: string;
      contractNum?: string;
      creditor?: string;
      value: number;
      commitmentNumber?: string;
      budgetAllocation?: string;
      issueDate?: string;
    }
  | {
      type: "create_creditor";
      name: string;
      cnpj?: string;
      category?: string;
    }
  | {
      type: "create_alert";
      title: string;
      desc: string;
      linkTab?: ActiveTab;
    };

interface AiResponse {
  reply: string;
  actions?: AiAction[];
}

interface AiAssistantViewProps {
  contracts: Contract[];
  creditors: Creditor[];
  commitments: Commitment[];
  notes: ServiceNote[];
  onAddContract: (contract: Omit<Contract, "id">) => void;
  onAddCommitment: (commitment: Omit<Commitment, "id" | "currentBalance" | "balance">) => void;
  onAddNote: (note: ServiceNote) => void;
  onAddCreditor: (creditor: Creditor) => void;
  onAddAlert: (alert: { title: string; desc: string; linkTab?: ActiveTab }) => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

const fixMojibake = (value: string) => {
  const replacements: Record<string, string> = {
    "OlÃ¡": "Olá",
    VocÃª: "Você",
    "tambÃ©m": "também",
    "estÃ¡": "está",
    "possÃ­veis": "possíveis",
    pendÃªncias: "pendências",
    "atenÃ§Ã£o": "atenção",
    "anÃ¡lise": "análise",
    "nÃ£o": "não",
    "aÃ§Ã£o": "ação",
    "aÃ§Ãµes": "ações",
    "AÃ§Ãµes": "Ações",
    "automÃ¡tica": "automática",
    "automÃ¡tico": "automático",
    "disponÃ­vel": "disponível",
    nÃºmero: "número",
    "descriÃ§Ã£o": "descrição",
    "lÃ­quido": "líquido",
    "informaÃ§Ãµes": "informações",
    "rÃ¡pida": "rápida",
    "NÃ£o": "Não",
    "ConcluÃ­": "Concluí",
    "Ã¡": "á",
    "Ã©": "é",
    "Ã­": "í",
    "Ã³": "ó",
    Ãº: "ú",
    "Ã£": "ã",
    Ãµ: "õ",
    "Ã§": "ç",
    Ãª: "ê",
  };

  return Object.entries(replacements).reduce(
    (text, [from, to]) => text.replaceAll(from, to),
    value,
  );
};

const cleanAiText = (value: string) =>
  fixMojibake(value || "")
    .replaceAll("Analisando PDFs, textos e preparando cadastro...", "Preparando resposta...")
    .replaceAll("Analisando PDFs, textos e preparando cadastro", "Preparando resposta")
    .replace(/(?:Preparando resposta\.{0,3}\s*){2,}/g, "Preparando resposta...");

const coerceActionType = (value: string) => {
  const normalized = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, AiAction["type"]> = {
    creditor: "create_creditor",
    credor: "create_creditor",
    empresa: "create_creditor",
    create_creditor: "create_creditor",
    contract: "create_contract",
    contrato: "create_contract",
    create_contract: "create_contract",
    commitment: "create_commitment",
    empenho: "create_commitment",
    create_commitment: "create_commitment",
    note: "create_note",
    nota: "create_note",
    nota_fiscal: "create_note",
    nota_servico: "create_note",
    nota_de_servico: "create_note",
    create_note: "create_note",
    alert: "create_alert",
    alerta: "create_alert",
    create_alert: "create_alert",
  };
  return aliases[normalized] || value;
};

const normalizeAction = (raw: any): AiAction | null => {
  if (!raw || typeof raw !== "object") return null;
  const type = coerceActionType(
    String(raw.type || raw.tipo || raw.action || raw.acao || raw.cadastro || ""),
  );

  if (type === "create_creditor") {
    const name =
      raw.name ||
      raw.nome ||
      raw.empresa ||
      raw.creditor ||
      raw.credor ||
      raw.razaoSocial ||
      raw.razao_social;
    if (!name) return null;
    return {
      type,
      name: String(name),
      cnpj: raw.cnpj || "",
      category: raw.category || raw.categoria || "Saúde",
    };
  }

  if (type === "create_contract") {
    return {
      type,
      contractNum: String(
        raw.contractNum ||
          raw.contract_num ||
          raw.numeroContrato ||
          raw.numero_contrato ||
          raw.numero ||
          raw.contrato ||
          "",
      ),
      creditor: String(raw.creditor || raw.credor || raw.empresa || raw.contratada || ""),
      object: String(raw.object || raw.objeto || raw.descricao || raw.descrição || ""),
      startDate:
        raw.startDate || raw.start_date || raw.inicio || raw.dataInicio || raw.data_inicio || "",
      endDate:
        raw.endDate ||
        raw.end_date ||
        raw.vencimento ||
        raw.fim ||
        raw.dataFim ||
        raw.data_fim ||
        "",
      totalValue: Number(
        raw.totalValue || raw.total_value || raw.valorTotal || raw.valor_total || raw.valor || 0,
      ),
      category: raw.category || raw.categoria || raw.secretaria || "Secretaria Municipal de Saúde",
    };
  }

  if (type === "create_commitment") {
    return {
      type,
      number: String(
        raw.number || raw.numero || raw.numeroEmpenho || raw.numero_empenho || raw.empenho || "",
      ),
      budgetAllocation: String(
        raw.budgetAllocation || raw.budget_allocation || raw.dotacao || raw.dotação || "",
      ),
      program: String(raw.program || raw.programa || ""),
      value: Number(raw.value || raw.valor || raw.valorEmpenho || raw.valor_empenho || 0),
      balance: Number(raw.balance || raw.saldo || 0),
      description: raw.description || raw.descricao || raw.descrição || "",
    };
  }

  if (type === "create_note") {
    return {
      type,
      noteNumber: String(
        raw.noteNumber ||
          raw.note_number ||
          raw.numeroNota ||
          raw.numero_nota ||
          raw.numero ||
          raw.nota ||
          "",
      ),
      contractNum:
        raw.contractNum ||
        raw.contract_num ||
        raw.numeroContrato ||
        raw.numero_contrato ||
        raw.contrato ||
        "",
      creditor: raw.creditor || raw.credor || raw.empresa || raw.contratada || "",
      value: Number(
        raw.value ||
          raw.valor ||
          raw.valorNota ||
          raw.valor_nota ||
          raw.valorLiquido ||
          raw.valor_liquido ||
          0,
      ),
      commitmentNumber:
        raw.commitmentNumber ||
        raw.commitment_number ||
        raw.numeroEmpenho ||
        raw.numero_empenho ||
        raw.empenho ||
        "",
      budgetAllocation:
        raw.budgetAllocation || raw.budget_allocation || raw.dotacao || raw.dotação || "",
      issueDate:
        raw.issueDate ||
        raw.issue_date ||
        raw.dataEmissao ||
        raw.data_emissao ||
        raw.emissao ||
        raw.emissão ||
        "",
    };
  }

  if (type === "create_alert") {
    return {
      type,
      title: String(raw.title || raw.titulo || raw.título || ""),
      desc: String(raw.desc || raw.descricao || raw.descrição || raw.mensagem || ""),
      linkTab: raw.linkTab || raw.link_tab,
    };
  }

  return null;
};

const collectActions = (parsed: any): AiAction[] => {
  if (Array.isArray(parsed)) return parsed.map(normalizeAction).filter(Boolean) as AiAction[];
  if (!parsed || typeof parsed !== "object") return [];

  const buckets = [
    parsed.actions,
    parsed.acoes,
    parsed.ações,
    parsed.cadastros,
    parsed.registros,
    parsed.notas,
    parsed.notasFiscais,
    parsed.notas_fiscais,
    parsed.contratos,
    parsed.empenhos,
    parsed.credores,
    parsed.alertas,
  ];

  const actions = buckets.flatMap((bucket) => (Array.isArray(bucket) ? bucket : []));
  if (actions.length) return actions.map(normalizeAction).filter(Boolean) as AiAction[];

  const single = normalizeAction(parsed);
  return single ? [single] : [];
};

const parseJsonResponse = (text: string): AiResponse => {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replaceAll("Analisando PDFs, textos e preparando cadastro...", "Preparando resposta...")
    .replaceAll("Analisando PDFs, textos e preparando cadastro", "Preparando resposta")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const jsonText =
    firstBrace >= 0 && lastBrace >= 0 ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

  try {
    const parsed = JSON.parse(jsonText);
    const actions = collectActions(parsed);
    return {
      ...parsed,
      reply: cleanAiText(
        parsed.reply ||
          parsed.resposta ||
          parsed.mensagem ||
          (actions.length ? "Processando cadastros identificados." : ""),
      ),
      actions,
    };
  } catch {
    return {
      reply:
        cleanAiText(cleaned) || "Consegui analisar, mas não consegui montar uma ação automática.",
    };
  }
};

const normalize = (value: string) => value.toLowerCase().trim();

const filterAllowedActions = (actions: AiAction[] = []) => actions;

const isConfirmationText = (value: string) =>
  /^(confirmar|confirmo|pode|pode salvar|salvar|cadastrar|confirmar cadastro|sim)$/i.test(
    value.trim(),
  );

const describeAction = (action: AiAction) => {
  if (action.type === "create_creditor") {
    return `Credor: ${action.name || "nome pendente"}${action.cnpj ? ` | CNPJ: ${action.cnpj}` : ""}`;
  }

  if (action.type === "create_contract") {
    const missing = [
      !action.contractNum ? "número do contrato" : "",
      !action.creditor ? "empresa" : "",
      !action.object ? "objeto do contrato" : "",
      !action.totalValue ? "valor" : "",
      !action.startDate ? "início da vigência" : "",
      !action.endDate ? "vencimento" : "",
    ].filter(Boolean);

    return [
      `Contrato: ${action.contractNum || "número pendente"}`,
      `Empresa: ${action.creditor || "pendente"}`,
      `Objeto: ${action.object || "pendente"}`,
      `Valor: ${formatCurrency(Number(action.totalValue) || 0)}`,
      action.startDate || action.endDate
        ? `Vigência: ${action.startDate || "-"} até ${action.endDate || "-"}`
        : "",
      missing.length ? `Confirmar/completar: ${missing.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (action.type === "create_commitment") {
    const missing = [
      !action.number ? "número do empenho" : "",
      !action.budgetAllocation ? "dotação" : "",
      !action.program ? "programa" : "",
      !action.value ? "valor" : "",
    ].filter(Boolean);

    return [
      `Empenho: ${action.number || "número pendente"}`,
      `Dotação: ${action.budgetAllocation || "pendente"}`,
      `Programa: ${action.program || "pendente"}`,
      `Valor: ${formatCurrency(Number(action.value) || 0)}`,
      missing.length ? `Confirmar/completar: ${missing.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return "";
};

const buildConfirmationText = (actions: AiAction[]) =>
  `Preparei estes cadastros, mas ainda não salvei. Confira principalmente o objeto do contrato, empresa, número, vigência, valor, dotação e programa.\n\n${actions
    .map((action, index) => `${index + 1}. ${describeAction(action)}`)
    .join(
      "\n\n",
    )}\n\nPara salvar, clique em Confirmar ou responda "confirmar". Para corrigir, envie os dados certos na mensagem.`;

const getActionLabel = (action: AiAction) => {
  if (action.type === "create_creditor") return `credor ${action.name || ""}`.trim();
  if (action.type === "create_contract") return `contrato ${action.contractNum || ""}`.trim();
  if (action.type === "create_commitment") return `empenho ${action.number || ""}`.trim();
  if (action.type === "create_note") return `nota ${action.noteNumber || ""}`.trim();
  if (action.type === "create_alert") return `alerta ${action.title || ""}`.trim();
  return "ação";
};

const formatExecutionResult = (result: { executed: string[]; skipped: string[] }) => {
  const parts: string[] = [];
  if (result.executed.length) {
    parts.push(`Ações executadas:\n${result.executed.map((item) => `- ${item}`).join("\n")}`);
  }
  if (result.skipped.length) {
    parts.push(`Não executadas:\n${result.skipped.map((item) => `- ${item}`).join("\n")}`);
  }
  if (!parts.length) {
    return "\n\nNenhum cadastro foi salvo porque a IA não retornou ações de cadastro com dados suficientes.";
  }
  return `\n\n${parts.join("\n\n")}`;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const parsed = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysUntil = (date?: string) => {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86400000);
};

const parseNumber = (value?: string) => {
  if (!value) return 0;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(cleaned) || 0;
};

const findValueNear = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[^\\d]*(\\d[\\d.,]*)`, "i"));
    if (match?.[1]) return parseNumber(match[1]);
  }
  const currency = text.match(/R\$\s*([\d.,]+)/i);
  return currency?.[1] ? parseNumber(currency[1]) : 0;
};

const findTextAfter = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n;]+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
};

const detectProgram = (text: string, budgetAllocation: string) => {
  const upperText = text.toUpperCase();
  const programs = PROGRAMS_BY_ALLOCATION[budgetAllocation] || [];
  return (
    programs.find((program) =>
      upperText.includes(
        program
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase(),
      ),
    ) ||
    programs.find((program) => upperText.includes(program.toUpperCase())) ||
    programs[0] ||
    ""
  );
};

const createLocalResponse = (prompt: string): AiResponse => {
  const contractNum =
    prompt.match(/(?:contrato|ct)\s*(?:n[ºo.]*)?\s*[:\-]?\s*([A-Za-z0-9./-]+)/i)?.[1] || "";
  const commitmentNumber =
    prompt.match(/(?:empenho|ne)\s*(?:n[ºo.]*)?\s*[:\-]?\s*([A-Za-z0-9./-]+)/i)?.[1] || "";
  const noteNumber =
    prompt.match(/(?:nota fiscal|nota|nf)\s*(?:n[ºo.]*)?\s*[:\-]?\s*([A-Za-z0-9./-]+)/i)?.[1] || "";
  const budgetAllocation = prompt.match(/\b06\.(?:01|06)\b/)?.[0] || "";
  const creditor = findTextAfter(prompt, ["credor", "empresa", "contratada", "fornecedor"]);
  const object = findTextAfter(prompt, ["objeto", "descricao", "descrição"]);
  const totalValue = findValueNear(prompt, ["valor do contrato", "valor global", "valor total"]);
  const commitmentValue = findValueNear(prompt, [
    "valor do empenho",
    "empenho valor",
    "valor empenho",
  ]);
  const commitmentBalance = findValueNear(prompt, ["saldo atual", "saldo do empenho", "saldo"]);
  const noteValue = findValueNear(prompt, [
    "valor da nota",
    "nota valor",
    "valor liquido",
    "valor líquido",
  ]);
  const actions: AiAction[] = [];
  const lower = prompt.toLowerCase();

  if ((lower.includes("credor") || lower.includes("empresa")) && creditor) {
    actions.push({
      type: "create_creditor",
      name: creditor,
      cnpj: prompt.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0] || "",
    });
  }

  if (
    contractNum &&
    creditor &&
    object &&
    (lower.includes("contrato") || lower.includes("cadastre"))
  ) {
    actions.push({
      type: "create_contract",
      contractNum,
      creditor,
      object,
      totalValue,
      category: "Secretaria Municipal de Saúde",
    });
  }

  if (commitmentNumber && budgetAllocation && (commitmentValue || commitmentBalance)) {
    actions.push({
      type: "create_commitment",
      number: commitmentNumber,
      budgetAllocation,
      program: detectProgram(prompt, budgetAllocation),
      value: commitmentValue || commitmentBalance,
      balance: commitmentBalance || commitmentValue,
      description: "Identificado automaticamente pelo chat",
    });
  }

  if (noteNumber && noteValue) {
    actions.push({
      type: "create_note",
      noteNumber,
      contractNum,
      creditor,
      value: noteValue,
      commitmentNumber,
      budgetAllocation,
      issueDate: findTextAfter(prompt, [
        "data de emissao",
        "data de emissão",
        "emissao",
        "emissão",
      ]),
    });
  }

  if (actions.length === 0) {
    return {
      reply:
        "Consegui ler a mensagem, mas faltam dados para cadastrar. Envie número de contrato ou empenho, credor, objeto, dotação e valor.",
    };
  }

  return {
    reply: "Identifiquei os dados principais e executei o cadastro automático disponível.",
    actions,
  };
};

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  contracts,
  creditors,
  commitments,
  notes,
  onAddContract,
  onAddCommitment,
  onAddNote,
  onAddCreditor,
  onAddAlert,
}) => {
  const emittedAlertKeysRef = useRef<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem("fiscalpro_ai_messages");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((message) => ({
            ...message,
            text: cleanAiText(String(message.text || "")),
          }));
        }
      }
    } catch (error) {
      console.error(error);
    }

    return [
      {
        id: "welcome",
        role: "assistant",
        text: "Olá! Sou a IA do FiscalPro. Você pode anexar PDF ou escrever os dados; eu identifico empresa já cadastrada, contrato, empenho, nota, dotação, programa, valores e faço os cadastros quando houver informação suficiente.",
      },
    ];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Preparando resposta...");
  const [lastActions, setLastActions] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [pendingActions, setPendingActions] = useState<AiAction[]>([]);

  useEffect(() => {
    const cleanMessages = messages.slice(-40).map((message) => ({
      ...message,
      text: cleanAiText(message.text),
    }));
    localStorage.setItem("fiscalpro_ai_messages", JSON.stringify(cleanMessages));
  }, [messages]);

  const systemContext = useMemo(() => {
    const compactContracts = contracts.slice(0, 80).map((item) => ({
      numero: item.contractNum,
      credor: item.creditor,
      objeto: item.object,
      valor: item.totalValue,
      status: item.status,
    }));

    const compactCommitments = commitments.slice(0, 80).map((item) => ({
      id: item.id,
      numero: item.number,
      dotacao: item.budgetAllocation,
      programa: item.program,
      valor: item.value,
      saldoAtual: item.currentBalance,
    }));

    const compactNotes = notes.slice(0, 80).map((item) => ({
      numero: item.noteNumber,
      contrato: item.contractNum,
      credor: item.creditor,
      valor: item.value,
      status: item.status,
      empenho: item.commitmentNumber,
      dotacao: item.budgetAllocation,
      programa: item.program,
      dataEmissao: item.issueDate,
      dataAtesto: item.attestationDate,
      fiscal: item.fiscalName,
    }));

    const compactCreditors = creditors.slice(0, 80).map((item) => ({
      nome: item.name,
      cnpj: item.cnpj,
      categoria: item.category,
    }));

    return JSON.stringify({
      hoje: new Date().toLocaleDateString("pt-BR"),
      contratos: compactContracts,
      empenhos: compactCommitments,
      notas: compactNotes,
      credores: compactCreditors,
      dotacoes: {
        "06.01": PROGRAMS_BY_ALLOCATION["06.01"],
        "06.06": PROGRAMS_BY_ALLOCATION["06.06"],
      },
    });
  }, [contracts, creditors, commitments, notes]);

  const buildSystemAudit = (): AiResponse => {
    const actions: AiAction[] = [];
    const findings: string[] = [];

    contracts.forEach((contract) => {
      const missing = [
        !contract.object ? "objeto" : "",
        !contract.endDate ? "vencimento" : "",
        !contract.fiscalName ? "nome do fiscal" : "",
      ].filter(Boolean);

      if (missing.length > 0) {
        findings.push(
          `Contrato ${contract.contractNum} (${contract.creditor}) com dados pendentes: ${missing.join(", ")}.`,
        );
        actions.push({
          type: "create_alert",
          title: `Dados pendentes no contrato ${contract.contractNum}`,
          desc: `Verificar e completar: ${missing.join(", ")}. Credor: ${contract.creditor}.`,
          linkTab: "contratos-lancados",
        });
      }

      const remainingDays = daysUntil(contract.endDate);
      if (remainingDays !== null && remainingDays <= 30) {
        const statusText =
          remainingDays < 0
            ? `vencido ha ${Math.abs(remainingDays)} dia(s)`
            : `vence em ${remainingDays} dia(s)`;
        findings.push(`Contrato ${contract.contractNum} (${contract.creditor}) ${statusText}.`);
        actions.push({
          type: "create_alert",
          title: `Vencimento do contrato ${contract.contractNum}`,
          desc: `O contrato ${contract.contractNum}, credor ${contract.creditor}, ${statusText}.`,
          linkTab: "contratos-lancados",
        });
      }
    });

    commitments.forEach((commitment) => {
      const baseValue = Number(commitment.value || 0);
      const currentBalance = Number(commitment.currentBalance || 0);
      const lowByPercent = baseValue > 0 && currentBalance / baseValue <= 0.2;
      const lowByAmount = currentBalance > 0 && currentBalance <= 1000;

      if (currentBalance < 0 || lowByPercent || lowByAmount) {
        const severity = currentBalance < 0 ? "saldo negativo" : "saldo baixo";
        findings.push(
          `Empenho ${commitment.number} com ${severity}: ${formatCurrency(currentBalance)}.`,
        );
        actions.push({
          type: "create_alert",
          title: `Alerta de saldo do empenho ${commitment.number}`,
          desc: `Saldo atual: ${formatCurrency(currentBalance)}. Dotação ${commitment.budgetAllocation}, programa ${commitment.program}.`,
          linkTab: "empenhos",
        });
      }
    });

    notes.forEach((note) => {
      if (!note.commitmentNumber || !note.budgetAllocation || !note.program) {
        findings.push(`Nota ${note.noteNumber} sem vínculo completo de empenho/dotação/programa.`);
        actions.push({
          type: "create_alert",
          title: `Nota ${note.noteNumber} sem empenho completo`,
          desc: `Vincule a nota ao empenho correto para puxar dotação, programa e saldo.`,
          linkTab: "notas",
        });
      }

      if (note.status === "Pendente" && !note.attestationDate) {
        findings.push(`Nota ${note.noteNumber} permanece pendente de atesto.`);
        actions.push({
          type: "create_alert",
          title: `Nota ${note.noteNumber} pendente de atesto`,
          desc: `Informe a data de atesto para marcar a nota como concluída.`,
          linkTab: "notas",
        });
      }
    });

    if (findings.length === 0) {
      return {
        reply:
          "Olá! Fiz uma análise do sistema e, no momento, não identifiquei contratos, notas, empenhos ou saldos com pendência crítica. A base está bem organizada.",
      };
    }

    return {
      reply: `Olá! Fiz uma análise do sistema e encontrei estes pontos que precisam de atenção:\n${findings
        .slice(0, 8)
        .map((item) => `- ${item}`)
        .join("\n")}`,
      actions,
    };
  };

  const shouldRunSystemAudit = (promptText: string, fileCount: number) => {
    const lower = promptText.toLowerCase();
    return (
      fileCount > 0 ||
      lower.includes("analise") ||
      lower.includes("análise") ||
      lower.includes("alerta") ||
      lower.includes("verificar sistema") ||
      lower.includes("pendencia") ||
      lower.includes("pendência") ||
      lower.includes("saldo") ||
      lower.includes("vencimento") ||
      lower.includes("processo")
    );
  };

  const ensureProfessionalGreeting = (reply: string, auditReply?: string) => {
    const cleaned = (reply || "").trim();
    const withGreeting = /^ol[aá]/i.test(cleaned)
      ? cleaned
      : `Olá! ${cleaned || "Concluí a análise solicitada."}`;

    if (
      !auditReply ||
      withGreeting.toLowerCase().includes("análise do sistema") ||
      withGreeting.toLowerCase().includes("analise do sistema")
    ) {
      return withGreeting;
    }

    return `${withGreeting}\n\n${auditReply}`;
  };

  const executeActions = (actions: AiAction[] = [], confirmed = true) => {
    const executed: string[] = [];
    const skipped: string[] = [];
    const allowedActions = filterAllowedActions(actions);

    if (!confirmed) {
      setPendingActions(allowedActions);
      return allowedActions.length ? ["Cadastros aguardando confirmação do usuário"] : [];
    }

    allowedActions.forEach((action) => {
      if (action.type === "create_creditor" && action.name) {
        const alreadyExists = creditors.some(
          (item) =>
            normalize(item.name) === normalize(action.name) ||
            (!!action.cnpj && item.cnpj.replace(/\D/g, "") === action.cnpj.replace(/\D/g, "")),
        );
        if (!alreadyExists) {
          onAddCreditor({
            id: `cred-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            name: action.name,
            cnpj: action.cnpj || "",
            category: action.category || "Saúde",
            activeContractsCount: 0,
            totalValue: 0,
            status: "Ativo",
          });
          executed.push(`Credor cadastrado: ${action.name}`);
        } else {
          skipped.push(`Credor já cadastrado: ${action.name}`);
        }
        return;
      }

      if (
        action.type === "create_contract" &&
        action.contractNum &&
        action.creditor &&
        action.object
      ) {
        const alreadyExists = contracts.some(
          (item) => normalize(item.contractNum) === normalize(action.contractNum),
        );
        const matchedCreditor = creditors.find(
          (item) =>
            normalize(item.name) === normalize(action.creditor) ||
            normalize(item.name).includes(normalize(action.creditor)) ||
            normalize(action.creditor).includes(normalize(item.name)),
        );
        if (!alreadyExists) {
          onAddContract({
            contractNum: action.contractNum,
            creditor: matchedCreditor?.name || action.creditor,
            object: action.object,
            startDate: action.startDate || "",
            endDate: action.endDate || "",
            totalValue: Number(action.totalValue) || 0,
            usedValue: 0,
            status: "Ativo",
            category: action.category || "Secretaria Municipal de Saúde",
            fiscalName: "",
            fiscalPortaria: "",
            fiscalPortariaPublicationDate: "",
            fiscalPortariaValidity: "",
            items: [],
          });
          executed.push(`Contrato cadastrado: ${action.contractNum}`);
        } else {
          skipped.push(`Contrato já cadastrado: ${action.contractNum}`);
        }
        return;
      }

      if (action.type === "create_commitment" && action.number && action.budgetAllocation) {
        const alreadyExists = commitments.some(
          (item) => normalize(item.number) === normalize(action.number),
        );
        if (!alreadyExists) {
          const value = Number(action.value) || 0;
          onAddCommitment({
            number: action.number,
            budgetAllocation: action.budgetAllocation,
            program:
              action.program || detectProgram(action.description || "", action.budgetAllocation),
            value,
            description: action.description || "Cadastrado pela IA",
          });
          executed.push(`Empenho cadastrado: ${action.number}`);
        } else {
          skipped.push(`Empenho já cadastrado: ${action.number}`);
        }
        return;
      }

      if (action.type === "create_note" && action.noteNumber && action.value) {
        const alreadyExists = notes.some(
          (item) => normalize(item.noteNumber) === normalize(action.noteNumber),
        );
        const selectedCommitment =
          commitments.find(
            (item) => normalize(item.number) === normalize(action.commitmentNumber || ""),
          ) || commitments.find((item) => item.budgetAllocation === action.budgetAllocation);
        const commitmentDraft = allowedActions.find(
          (item) =>
            item.type === "create_commitment" &&
            (normalize(item.number) === normalize(action.commitmentNumber || "") ||
              item.budgetAllocation === action.budgetAllocation),
        );
        const selectedContract = contracts.find(
          (item) => normalize(item.contractNum) === normalize(action.contractNum || ""),
        );
        const selectedCreditor = creditors.find(
          (item) =>
            normalize(item.name) === normalize(action.creditor || "") ||
            normalize(item.name).includes(normalize(action.creditor || "")) ||
            normalize(action.creditor || "").includes(normalize(item.name)),
        );
        const noteValue = Number(action.value) || 0;
        const commitmentBalance =
          selectedCommitment?.currentBalance ??
          selectedCommitment?.balance ??
          commitmentDraft?.balance ??
          commitmentDraft?.value ??
          0;
        const budgetAllocation =
          selectedCommitment?.budgetAllocation ||
          commitmentDraft?.budgetAllocation ||
          action.budgetAllocation ||
          "";
        const program =
          selectedCommitment?.program ||
          commitmentDraft?.program ||
          detectProgram(commitmentDraft?.description || "", budgetAllocation);

        if (!alreadyExists) {
          onAddNote({
            id: `n-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            noteNumber: action.noteNumber,
            contractNum:
              action.contractNum || selectedContract?.contractNum || "Contrato Não Selecionado",
            creditor:
              selectedCreditor?.name ||
              action.creditor ||
              selectedContract?.creditor ||
              "Credor Não Identificado",
            issueDate: action.issueDate || "",
            attestationDate: "",
            fiscalName: "",
            value: noteValue,
            status: "Pendente",
            budgetAllocation,
            program,
            commitmentNumber:
              selectedCommitment?.number ||
              commitmentDraft?.number ||
              action.commitmentNumber ||
              "",
            commitmentValue: selectedCommitment?.value || commitmentDraft?.value || 0,
            commitmentBalance,
            currentBalance: commitmentBalance - noteValue,
            commitmentId: selectedCommitment?.id || "",
          });
          executed.push(`Nota cadastrada: ${action.noteNumber} (${formatCurrency(noteValue)})`);
        } else {
          skipped.push(`Nota já cadastrada: ${action.noteNumber}`);
        }
        return;
      }

      if (action.type === "create_alert" && action.title) {
        const key = `${normalize(action.title)}|${normalize(action.desc || "")}`;
        if (emittedAlertKeysRef.current.has(key)) return;
        emittedAlertKeysRef.current.add(key);

        onAddAlert({
          title: action.title,
          desc: action.desc || "Alerta emitido pela IA FiscalPro.",
          linkTab: action.linkTab,
        });
        executed.push(`Alerta emitido: ${action.title}`);
        return;
      }

      skipped.push(`Não cadastrado: ${getActionLabel(action)} com dados obrigatórios incompletos.`);
    });

    setLastActions(executed.length ? executed : skipped);
    return { executed, skipped };
  };

  const confirmPendingActions = () => {
    if (pendingActions.length === 0) return;
    const result = executeActions(pendingActions, true);
    const executedText = formatExecutionResult(result).trim();

    setPendingActions([]);
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: executedText,
      },
    ]);
  };

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files) return;
    const pdfFiles = Array.from(files).filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );
    const converted = await Promise.all(
      pdfFiles.map(
        (file) =>
          new Promise<AttachedFile>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                id: `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                filename: file.name,
                fileData: String(reader.result),
                size: file.size,
              });
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          }),
      ),
    );

    setAttachedFiles((prev) => [...prev, ...converted]);
  };

  const sendMessage = async () => {
    const prompt = input.trim();
    if ((!prompt && attachedFiles.length === 0) || isLoading) return;

    if (isConfirmationText(prompt) && pendingActions.length > 0 && attachedFiles.length === 0) {
      const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", text: prompt };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      confirmPendingActions();
      return;
    }

    const fileSummary = attachedFiles.length
      ? `\n\nArquivos anexados:\n${attachedFiles.map((file) => `- ${file.filename}`).join("\n")}`
      : "";
    const finalPrompt =
      prompt ||
      "Analise os PDFs anexados, identifique empresa, contrato, empenho, nota, dotação, programa, valores e faça os cadastros quando houver dados suficientes.";

    const restrictedPrompt = `REGRAS DA IA FISCALPRO:
- Responda em JSON com "reply" e "actions".
- A IA pode cadastrar credores, contratos, empenhos, notas e alertas quando houver dados suficientes.
- Antes de criar credor, verifique a lista de credores no contexto; se a empresa já existir, use exatamente o nome cadastrado.
- Em contratos e notas, vincule ao contrato, credor e empenho existentes quando encontrar correspondência por número, CNPJ ou nome da empresa.
- Para cada PDF de nota fiscal ou nota de serviço, retorne uma action create_note quando encontrar número da nota e valor. Use contractNum, creditor, commitmentNumber e budgetAllocation quando identificar.
- Em create_note, extraia a data de emissão do PDF e envie em issueDate. Não preencha attestationDate nem fiscalName; esses campos serão digitados manualmente pelo usuário.
- Se disser que uma nota foi cadastrada, obrigatoriamente inclua uma action create_note válida; se faltar número ou valor, diga que não foi cadastrada e informe o campo faltante.
- Identifique dotação 06.01 ou 06.06 e escolha o programa compatível pela lista do sistema.
- Em contratos, extraia objeto, empresa, número, vigência, valor, secretaria/fundo e fiscal quando houver.
- Se vier PDF, leia e extraia os dados prováveis; se algum campo estiver incerto, informe no reply.
- Actions permitidas: create_creditor, create_contract, create_commitment, create_note, create_alert.

PEDIDO DO USUÁRIO:
${finalPrompt}`;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: `${finalPrompt}${fileSummary}`,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const filesToSend = attachedFiles;
    setAttachedFiles([]);
    setIsLoading(true);
    setLastActions([]);
    const runAudit = shouldRunSystemAudit(finalPrompt, filesToSend.length);
    const nextLoadingText =
      filesToSend.length > 0
        ? "Lendo anexos e extraindo informações..."
        : runAudit
          ? "Analisando o sistema e preparando resposta..."
          : "Preparando resposta...";
    setLoadingText(
      filesToSend.length > 0
        ? "Lendo anexos e extraindo informa\u00e7\u00f5es..."
        : cleanAiText(nextLoadingText),
    );

    try {
      const audit = runAudit ? buildSystemAudit() : undefined;
      const supabaseConfig = getSupabaseConfig();
      const response = await fetch(`${supabaseConfig.url}/functions/v1/openrouter-chat`, {
        method: "POST",
        headers: {
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${supabaseConfig.anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: restrictedPrompt,
          systemContext,
          localAudit: "",
          files: filesToSend,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.error) {
        const fallback = createLocalResponse(finalPrompt);
        const result = executeActions([...(audit?.actions || []), ...(fallback.actions || [])]);
        const executedText = formatExecutionResult(result);

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: `${ensureProfessionalGreeting(fallback.reply, audit?.reply)}\n\nOpenRouter não respondeu agora, usei leitura rápida local.${executedText}`,
          },
        ]);
        return;
      }

      const text = data?.choices?.[0]?.message?.content || "";
      const aiResponse = parseJsonResponse(text);
      const result = executeActions([...(audit?.actions || []), ...(aiResponse.actions || [])]);
      const executedText = formatExecutionResult(result);

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `${ensureProfessionalGreeting(aiResponse.reply || "Pronto.", audit?.reply)}${executedText}`,
        },
      ]);
    } catch (error) {
      console.error(error);
      const audit = runAudit ? buildSystemAudit() : undefined;
      const fallback = createLocalResponse(finalPrompt);
      const result = executeActions([...(audit?.actions || []), ...(fallback.actions || [])]);
      const executedText = formatExecutionResult(result);

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `${ensureProfessionalGreeting(fallback.reply, audit?.reply)}\n\nNão consegui falar com o OpenRouter agora, usei leitura rápida local.${executedText}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] min-h-[640px] grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-medium text-slate-900">IA FiscalPro</h1>
              <p className="text-xs text-slate-500">
                Cadastros inteligentes com empresa, contrato, empenho, nota e dotação.
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <Sparkles className="w-3.5 h-3.5" />
            <span>OpenRouter</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  message.role === "user"
                    ? "bg-emerald-600 text-white rounded-br-md"
                    : "bg-white text-slate-800 border border-slate-200 rounded-bl-md shadow-xs"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>{loadingText}</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white">
          {pendingActions.length > 0 && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-amber-950">Cadastros aguardando confirmação</p>
                  <p className="mt-1 text-amber-800">
                    Confira os dados extraídos, principalmente o objeto do contrato, antes de
                    salvar.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmPendingActions}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setPendingActions([])}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 font-medium transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          )}
          {attachedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-medium max-w-[220px] truncate">{file.filename}</span>
                  <button
                    onClick={() =>
                      setAttachedFiles((prev) => prev.filter((item) => item.id !== file.id))
                    }
                    className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    title="Remover PDF"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <label
              className="w-12 h-12 self-end inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
              title="Anexar PDF"
            >
              <Paperclip className="w-5 h-5" />
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleAttachFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              rows={2}
              placeholder="Digite uma orientação ou anexe PDFs para cadastrar credor, contrato, empenho, nota e vínculos..."
              className="flex-1 resize-none px-3.5 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
              className="w-12 h-12 self-end inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Enviar"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <aside className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-slate-900 flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-emerald-600" />
            <span>O que ela faz</span>
          </h2>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <p>
              Identifica objeto, número de contrato, credor, empenho, dotação, programa e valores.
            </p>
            <p>Lê PDFs anexados e extrai informações de contratos, empenhos e notas fiscais.</p>
            <p>Cadastra contrato, empenho, credor e nota quando os dados estiverem completos.</p>
            <p>Emite alertas administrativos para o usuário quando detectar risco ou pendência.</p>
            <p>Ao lançar nota, desconta do saldo do empenho pelo fluxo normal do sistema.</p>
            <p>Remove PDFs anexados antes do envio pelo botão ao lado do arquivo.</p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-medium uppercase text-slate-400">Base carregada</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-lg font-medium text-slate-900">{contracts.length}</p>
              <p className="text-[10px] text-slate-500">Contratos</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-lg font-medium text-slate-900">{commitments.length}</p>
              <p className="text-[10px] text-slate-500">Empenhos</p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
              <p className="text-lg font-medium text-slate-900">{creditors.length}</p>
              <p className="text-[10px] text-slate-500">Credores</p>
            </div>
          </div>
        </div>

        {lastActions.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-medium uppercase text-slate-400">Últimas ações</h3>
            <div className="mt-3 space-y-2">
              {lastActions.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-2 text-xs text-emerald-700 font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};
