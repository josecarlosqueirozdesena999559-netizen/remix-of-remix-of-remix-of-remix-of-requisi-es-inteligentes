import React, { useState, useMemo } from "react";
import {
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  Eye,
  FileText,
  Trash2,
  Search,
  Download,
  Filter,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Receipt,
  Link2,
  UserCheck,
  X,
  Check,
} from "lucide-react";
import { Contract, ContractAmendment, ContractStatus, ServiceNote } from "../types";
import {
  brDateToInputDate,
  formatBRDate,
  inputDateToBRDate,
  parseBRDate,
} from "../utils/dateFormat";

interface ContractTableProps {
  contracts: Contract[];
  notes?: ServiceNote[];
  onOpenNewContractModal: () => void;
  onViewContractDetails?: (contract: Contract) => void;
  onEditContract?: (contract: Contract) => void;
  onDeleteContract?: (id: string) => void;
  onAddAmendment?: (amendment: Omit<ContractAmendment, "id">, updateContract?: boolean) => void;
  onViewAllContracts?: () => void;
}

export const ContractTable: React.FC<ContractTableProps> = ({
  contracts,
  notes = [],
  onOpenNewContractModal,
  onViewContractDetails,
  onEditContract,
  onDeleteContract,
  onAddAmendment,
}) => {
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"Todos" | ContractStatus>("Todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("Todas");
  const [localSearch, setLocalSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Record<string, boolean>>({});
  const [amendmentContract, setAmendmentContract] = useState<Contract | null>(null);
  const [amendmentNum, setAmendmentNum] = useState("");
  const [amendmentType, setAmendmentType] =
    useState<ContractAmendment["type"]>("Prorrogação Contratual");
  const [amendmentValue, setAmendmentValue] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [justification, setJustification] = useState("");
  const [scopeChange, setScopeChange] = useState("");
  const [autoUpdateContract, setAutoUpdateContract] = useState(true);

  const amendmentTypes: ContractAmendment["type"][] = [
    "Prorrogação Contratual",
    "Realinhamento",
    "Aditivo por Rescisão",
    "Aditivo de Redução de Valor",
    "Acréscimo de Valor",
    "Aditivo por Diversas Alterações",
  ];

  const resetAmendmentForm = (contract?: Contract) => {
    setAmendmentContract(contract || null);
    setAmendmentNum("");
    setAmendmentType("Prorrogação Contratual");
    setAmendmentValue("");
    setNewEndDate(contract?.endDate || "");
    setSignatureDate("");
    setPublicationDate("");
    setJustification("");
    setScopeChange("");
    setAutoUpdateContract(true);
  };

  const requiresNewEndDate =
    amendmentType === "Prorrogação Contratual" ||
    amendmentType === "Aditivo por Diversas Alterações";
  const requiresValue = [
    "Realinhamento",
    "Aditivo de Redução de Valor",
    "Acréscimo de Valor",
    "Aditivo por Diversas Alterações",
  ].includes(amendmentType);
  const requiresScope = ["Aditivo por Rescisão", "Aditivo por Diversas Alterações"].includes(
    amendmentType,
  );

  const getSignedValueChange = () => {
    const parsed = parseFloat(amendmentValue) || 0;
    if (
      amendmentType === "Aditivo de Redução de Valor" ||
      amendmentType === "Aditivo por Rescisão"
    ) {
      return parsed > 0 ? -parsed : parsed;
    }
    return parsed;
  };

  const getAmendmentGuidance = () => {
    if (amendmentType === "Prorrogação Contratual") {
      return "Preencha a nova vigência, a justificativa da continuidade, a data de assinatura e a publicação.";
    }
    if (amendmentType === "Realinhamento") {
      return "Informe o valor do realinhamento, a justificativa técnica/econômica e as datas do termo.";
    }
    if (amendmentType === "Aditivo por Rescisão") {
      return "Informe o motivo da rescisão, assinatura, publicação e eventual valor/saldo rescindido.";
    }
    if (amendmentType === "Aditivo de Redução de Valor") {
      return "Informe o valor reduzido, a justificativa e as datas. O impacto financeiro será registrado como negativo.";
    }
    if (amendmentType === "Acréscimo de Valor") {
      return "Informe o valor acrescido, a justificativa, a data de assinatura e a publicação.";
    }
    return "Informe nova vigência ou valor quando houver, descreva todas as alterações e registre assinatura/publicação.";
  };

  const submitAmendment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendmentContract || !onAddAmendment) return;

    const detail = scopeChange.trim()
      ? `${justification}\n\nAlterações: ${scopeChange}`
      : justification;
    onAddAmendment(
      {
        amendmentNum,
        contractNum: amendmentContract.contractNum,
        creditor: amendmentContract.creditor,
        type: amendmentType,
        valueChange: getSignedValueChange(),
        newEndDate: newEndDate || undefined,
        signatureDate,
        publicationDate: publicationDate || undefined,
        justification: detail,
        status: "Vigente",
      },
      autoUpdateContract,
    );

    resetAmendmentForm();
  };

  const toggleExpand = (contractId: string) => {
    setExpandedContracts((prev) => ({
      ...prev,
      [contractId]: !prev[contractId],
    }));
  };

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ["Todas", ...Array.from(set)];
  }, [contracts]);

  // Counts for filter tabs
  const counts = useMemo(() => {
    return {
      Todos: contracts.length,
      Ativo: contracts.filter((c) => c.status === "Ativo").length,
      "A Vencer": contracts.filter((c) => c.status === "A Vencer").length,
      Encerrado: contracts.filter((c) => c.status === "Encerrado").length,
    };
  }, [contracts]);

  // Filtered Contracts
  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const matchesStatus = statusFilter === "Todos" || c.status === statusFilter;
      const matchesCategory = categoryFilter === "Todas" || c.category === categoryFilter;
      const matchesSearch =
        localSearch.trim() === "" ||
        c.contractNum.toLowerCase().includes(localSearch.toLowerCase()) ||
        c.creditor.toLowerCase().includes(localSearch.toLowerCase()) ||
        c.object.toLowerCase().includes(localSearch.toLowerCase()) ||
        (c.fiscalName && c.fiscalName.toLowerCase().includes(localSearch.toLowerCase())) ||
        (c.fiscalPortaria && c.fiscalPortaria.toLowerCase().includes(localSearch.toLowerCase()));

      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [contracts, statusFilter, categoryFilter, localSearch]);

  // Total value calculation for visible filtered items
  const totalValueSum = useMemo(() => {
    return filteredContracts.reduce((sum, c) => sum + c.totalValue, 0);
  }, [filteredContracts]);

  // Pagination logic
  const totalPages = Math.ceil(filteredContracts.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredContracts.slice(startIndex, startIndex + itemsPerPage);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  const calculateProgress = (startStr: string, endStr: string) => {
    const startDate = parseBRDate(startStr);
    const endDate = parseBRDate(endStr);
    if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today.getTime() <= startDate.getTime()) return 0;
    if (today.getTime() >= endDate.getTime()) return 100;

    const pct = Math.round(
      ((today.getTime() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())) * 100,
    );
    return Math.min(Math.max(pct, 0), 99);
  };

  const handleExportCSV = () => {
    const headers = [
      "Nº Contrato",
      "Credor",
      "Categoria",
      "Objeto",
      "Início",
      "Fim",
      "Valor Total",
      "Status",
    ];
    const rows = filteredContracts.map((c) => [
      c.contractNum,
      `"${c.creditor}"`,
      c.category || "Geral",
      `"${c.object.replace(/"/g, '""')}"`,
      c.startDate,
      c.endDate,
      c.totalValue,
      c.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_contratos_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice("Relatório CSV exportado com sucesso!");
    setTimeout(() => setExportNotice(null), 3500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col justify-between overflow-hidden transition-all">
      {/* Toast Export Notification */}
      {exportNotice && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{exportNotice}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-emerald-100 hover:text-white font-medium"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Header & Status Filter Tabs */}
      <div className="p-5 md:p-6 border-b border-slate-100 space-y-4">
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-medium text-slate-900 tracking-tight">
                Contratos Recentes
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                {filteredContracts.length} registrados
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visão completa dos contratos em vigência, aditivos e vencimentos do órgão
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2.5 self-start sm:self-auto">
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all cursor-pointer"
              title="Exportar contratos visíveis em arquivo CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={onOpenNewContractModal}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <FilePlus className="w-4 h-4" />
              <span>Novo Contrato</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Status Tabs + Search + Category */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100/80 p-1 rounded-xl overflow-x-auto text-xs font-medium">
            <button
              onClick={() => {
                setStatusFilter("Todos");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "Todos"
                  ? "bg-white text-slate-900 font-medium shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({counts.Todos})
            </button>

            <button
              onClick={() => {
                setStatusFilter("Ativo");
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "Ativo"
                  ? "bg-white text-slate-900 font-medium shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Ativos ({counts.Ativo})</span>
            </button>

            <button
              onClick={() => {
                setStatusFilter("A Vencer");
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "A Vencer"
                  ? "bg-white text-slate-900 font-medium shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>A Vencer ({counts["A Vencer"]})</span>
            </button>

            <button
              onClick={() => {
                setStatusFilter("Encerrado");
                setCurrentPage(1);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === "Encerrado"
                  ? "bg-white text-slate-900 font-medium shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Encerrados ({counts.Encerrado})</span>
            </button>
          </div>

          {/* Search Input & Category Filter Dropdown */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar contrato, credor ou objeto..."
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Category Select */}
            <div className="relative inline-flex items-center">
              <Filter className="w-3.5 h-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700 font-medium cursor-pointer appearance-none"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "Todas" ? "Todas Categorias" : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table Data Grid */}
      <div className="overflow-x-auto min-h-[320px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-medium uppercase tracking-wider text-[11px]">
              <th className="py-3.5 px-5">Contrato & Categoria</th>
              <th className="py-3.5 px-4">Credor / Contratada</th>
              <th className="py-3.5 px-4 max-w-sm">Objeto</th>
              <th className="py-3.5 px-4">Vigência & Execução</th>
              <th className="py-3.5 px-4 text-right">Saldo & Execução Financeira</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {currentItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-medium text-slate-600 text-sm">Nenhum contrato encontrado</p>
                  <p className="text-xs text-slate-400">
                    Tente ajustar seus filtros ou termo de busca.
                  </p>
                </td>
              </tr>
            ) : (
              currentItems.map((c) => {
                const progress = calculateProgress(c.startDate, c.endDate);

                // Calculate used value and remaining balance dynamically
                const matchedNotes = notes
                  ? notes.filter(
                      (n) =>
                        n.contractNum.toLowerCase().trim() === c.contractNum.toLowerCase().trim(),
                    )
                  : [];
                const notesSum = matchedNotes.reduce((sum, n) => sum + n.value, 0);
                const linkedNotesCount = matchedNotes.length;

                const used = Math.max(c.usedValue || 0, notesSum);
                const remaining = Math.max(0, c.totalValue - used);
                const usagePct = c.totalValue > 0 ? Math.round((used / c.totalValue) * 100) : 0;

                const formatVal = (v: number) => {
                  return new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(v);
                };

                const isExpanded = !!expandedContracts[c.id];

                return (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`hover:bg-slate-50/90 transition-colors group ${isExpanded ? "bg-slate-50/70" : ""}`}
                    >
                      {/* Contract Num & Category Tag */}
                      <td className="py-4 px-5">
                        <div className="flex flex-col space-y-1">
                          <span
                            onClick={() => onViewContractDetails?.(c)}
                            className="font-medium text-slate-900 group-hover:text-emerald-700 transition-colors cursor-pointer text-sm"
                          >
                            {c.contractNum}
                          </span>
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              {c.category || "Geral"}
                            </span>
                            {linkedNotesCount > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(c.id);
                                }}
                                className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-medium border transition-colors cursor-pointer ${
                                  isExpanded
                                    ? "bg-slate-800 text-white border-slate-800 hover:bg-slate-900"
                                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                                }`}
                                title={
                                  isExpanded
                                    ? "Ocultar Notas de Serviço"
                                    : "Ver Notas de Serviço Vinculadas"
                                }
                              >
                                <Receipt className="w-2.5 h-2.5" />
                                <span>
                                  {linkedNotesCount} {linkedNotesCount === 1 ? "Nota" : "Notas"}
                                </span>
                                <span className="text-[9px] opacity-75">
                                  {isExpanded ? "▲" : "▼"}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Creditor */}
                      <td className="py-4 px-4 font-medium text-slate-800">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{c.creditor}</p>
                          <p className="text-[11px] text-slate-400 font-normal">Contratada ativa</p>
                        </div>
                      </td>

                      {/* Objeto */}
                      <td className="py-4 px-4 max-w-xs text-slate-600">
                        <p className="line-clamp-2 leading-relaxed text-xs" title={c.object}>
                          {c.object}
                        </p>
                      </td>

                      {/* Vigência + Execution Progress Bar */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="space-y-1.5 w-36">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-slate-700">
                              {formatBRDate(c.startDate)}
                            </span>
                            <span className="text-slate-400">até {formatBRDate(c.endDate)}</span>
                          </div>
                          {/* Progress Bar */}
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                c.status === "Ativo"
                                  ? "bg-emerald-500"
                                  : c.status === "A Vencer"
                                    ? "bg-amber-500"
                                    : "bg-slate-400"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 text-right">
                            {progress}% do prazo decorrido
                          </p>
                        </div>
                      </td>

                      {/* Balance & Financial Execution */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="inline-block text-right space-y-1.5">
                          <div className="font-medium text-slate-900 text-sm">
                            {formatVal(c.totalValue)}
                          </div>
                          <div className="flex items-center justify-end space-x-1.5 text-[11px] text-slate-500 font-medium">
                            <span>
                              Saldo:{" "}
                              <strong className="text-emerald-700 font-medium">
                                {formatVal(remaining)}
                              </strong>
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-600 bg-slate-100 px-1 rounded text-[10px] font-medium">
                              {usagePct}% usado
                            </span>
                          </div>
                          {/* Mini progress bar */}
                          <div className="w-32 bg-slate-100 rounded-full h-1 ml-auto overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                usagePct > 80
                                  ? "bg-amber-500"
                                  : usagePct > 95
                                    ? "bg-rose-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(usagePct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-slate-400" />
                          {c.status}
                        </span>
                      </td>

                      {/* Actions Menu */}
                      <td className="py-4 px-4 text-right relative">
                        <button
                          onClick={() => setActiveActionId(activeActionId === c.id ? null : c.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeActionId === c.id && (
                          <div className="absolute right-5 top-12 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-30 text-left animate-fadeIn">
                            <button
                              onClick={() => {
                                setActiveActionId(null);
                                onViewContractDetails?.(c);
                              }}
                              className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Ver Detalhes</span>
                            </button>

                            {onEditContract && (
                              <button
                                onClick={() => {
                                  setActiveActionId(null);
                                  onEditContract(c);
                                }}
                                className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5 text-blue-600" />
                                <span>Editar Contrato</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setActiveActionId(null);
                                onViewContractDetails?.(c);
                              }}
                              className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <Receipt className="w-3.5 h-3.5 text-slate-500" />
                              <span>Notas de Serviço ({linkedNotesCount})</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveActionId(null);
                                resetAmendmentForm(c);
                              }}
                              className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-slate-400" />
                              <span>Lançar Aditivo</span>
                            </button>

                            {onDeleteContract && (
                              <button
                                onClick={() => {
                                  setActiveActionId(null);
                                  onDeleteContract(c.id);
                                }}
                                className="w-full flex items-center space-x-2 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                <span>Excluir Contrato</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50/40 border-b border-slate-200">
                        <td colSpan={7} className="p-0">
                          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 space-y-4 shadow-inner">
                            {/* Fiscal & Portaria Info Header & Card */}
                            <div className="hidden">
                              <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                                <UserCheck className="w-4 h-4 text-emerald-600" />
                                <span className="font-medium text-xs text-slate-900 uppercase tracking-wider">
                                  Dados da Fiscalização & Portaria de Nomeação
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                                    Fiscal do Contrato
                                  </span>
                                  <span className="font-medium text-slate-800">
                                    {c.fiscalName || "Não Informado"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                                    Portaria do Fiscal
                                  </span>
                                  <span className="font-medium text-emerald-700">
                                    {c.fiscalPortaria || "Não Informada"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                                    Publicação da Portaria
                                  </span>
                                  <span className="font-medium text-slate-700">
                                    {c.fiscalPortariaPublicationDate || "Não Informada"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                                    Vigência da Portaria
                                  </span>
                                  <span className="font-medium text-slate-700">
                                    {c.fiscalPortariaValidity || "Conforme Contrato"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center space-x-2">
                                <Receipt className="w-4 h-4 text-slate-600" />
                                <span className="font-medium text-xs text-slate-800 uppercase tracking-wider">
                                  Notas de Serviço Vinculadas ({matchedNotes.length})
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium">
                                Contrato: {c.contractNum}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {matchedNotes.map((note) => (
                                <div
                                  key={note.id}
                                  className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between hover:border-slate-300 transition-colors"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-medium text-xs text-slate-900">
                                        {note.noteNumber}
                                      </span>
                                      <span
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                          note.status === "Paga"
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                            : "bg-slate-100 text-slate-700 border border-slate-200"
                                        }`}
                                      >
                                        {note.status}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                      Contrato:{" "}
                                      <strong className="font-medium text-slate-700">
                                        {note.contractNum || c.contractNum}
                                      </strong>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium">
                                      Atesto:{" "}
                                      <strong className="font-medium text-slate-700">
                                        {note.attestationDate || "-"}
                                      </strong>
                                    </div>
                                    <div className="text-xs font-medium text-slate-900">
                                      R${" "}
                                      {note.value.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Summary Footer */}
      <div className="p-4 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            Mostrando{" "}
            <span className="font-medium text-slate-900">
              {filteredContracts.length > 0 ? startIndex + 1 : 0}
            </span>{" "}
            a{" "}
            <span className="font-medium text-slate-900">
              {Math.min(startIndex + itemsPerPage, filteredContracts.length)}
            </span>{" "}
            de <span className="font-medium text-slate-900">{filteredContracts.length}</span>{" "}
            contratos
          </div>

          <div className="hidden sm:block border-l border-slate-300 h-4" />

          <div className="text-slate-500">
            Soma dos visíveis:{" "}
            <span className="font-medium text-emerald-700">{formatCurrency(totalValueSum)}</span>
          </div>
        </div>

        {/* Page Selector & Navigation */}
        <div className="flex items-center justify-between sm:justify-end space-x-3">
          <div className="flex items-center space-x-1.5 text-slate-500">
            <span>Exibir:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Página Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 text-xs font-medium text-slate-700">
              {currentPage} / {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Próxima Página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {amendmentContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-fadeIn my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div>
                <h3 className="text-base font-medium text-slate-900">Lançar Aditivo</h3>
                <p className="text-[11px] text-slate-500">
                  Contrato {amendmentContract.contractNum} - {amendmentContract.creditor}
                </p>
              </div>
              <button
                onClick={() => resetAmendmentForm()}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitAmendment} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <span className="block text-[10px] uppercase font-medium text-emerald-700">
                    Valor atual
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatCurrency(amendmentContract.totalValue)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-medium text-emerald-700">
                    Vigência atual
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatBRDate(amendmentContract.startDate)} até{" "}
                    {formatBRDate(amendmentContract.endDate)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-medium text-emerald-700">
                    Status
                  </span>
                  <span className="font-medium text-slate-900">{amendmentContract.status}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Número / Identificação do Aditivo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={amendmentNum}
                    onChange={(e) => setAmendmentNum(e.target.value)}
                    placeholder="Ex: 1º Termo Aditivo"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Motivo do Aditivo <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={amendmentType}
                    onChange={(e) => setAmendmentType(e.target.value as ContractAmendment["type"])}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 cursor-pointer"
                  >
                    {amendmentTypes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 font-medium">
                {getAmendmentGuidance()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor da Alteração (R$){" "}
                    {requiresValue && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required={requiresValue}
                    value={amendmentValue}
                    onChange={(e) => setAmendmentValue(e.target.value)}
                    placeholder={
                      amendmentType === "Aditivo de Redução de Valor" ? "Ex: 5000" : "Ex: 15000"
                    }
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Redução e rescisão são gravadas como impacto negativo.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nova Data de Término{" "}
                    {requiresNewEndDate && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="date"
                    required={requiresNewEndDate}
                    value={brDateToInputDate(newEndDate)}
                    onChange={(e) => setNewEndDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Assinatura <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={brDateToInputDate(signatureDate)}
                    onChange={(e) => setSignatureDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Publicação
                  </label>
                  <input
                    type="date"
                    value={brDateToInputDate(publicationDate)}
                    onChange={(e) => setPublicationDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                </div>
              </div>

              {requiresScope && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alterações / Escopo <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={scopeChange}
                    onChange={(e) => setScopeChange(e.target.value)}
                    placeholder="Descreva as cláusulas, itens, obrigações ou condições alteradas."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa / Fundamentação <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Informe o motivo administrativo, necessidade, base do pedido e justificativa do termo."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                />
              </div>

              <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoUpdateContract}
                  onChange={(e) => setAutoUpdateContract(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span>
                  Atualizar automaticamente o contrato com o novo valor ou nova data de término
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => resetAmendmentForm()}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Aditivo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
