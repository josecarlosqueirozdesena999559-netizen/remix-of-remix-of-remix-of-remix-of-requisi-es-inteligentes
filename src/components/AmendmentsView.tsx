import React, { useState } from "react";
import {
  Layers,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Contract, ContractAmendment } from "../types";
import { brDateToInputDate, inputDateToBRDate } from "../utils/dateFormat";

interface AmendmentsViewProps {
  amendments: ContractAmendment[];
  contracts: Contract[];
  onAddAmendment: (amendment: Omit<ContractAmendment, "id">, updateContract?: boolean) => void;
  onUpdateAmendment: (amendment: ContractAmendment, updateContract?: boolean) => void;
  onDeleteAmendment: (id: string) => void;
}

export const AmendmentsView: React.FC<AmendmentsViewProps> = ({
  amendments,
  contracts,
  onAddAmendment,
  onUpdateAmendment,
  onDeleteAmendment,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("todos");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAmendment, setEditingAmendment] = useState<ContractAmendment | null>(null);

  // Form states
  const [selectedContractNum, setSelectedContractNum] = useState("");
  const [amendmentNum, setAmendmentNum] = useState("");
  const [type, setType] = useState<ContractAmendment["type"]>("Acréscimo de Valor");
  const [valueChange, setValueChange] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [signatureDate, setSignatureDate] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [justification, setJustification] = useState("");
  const [status, setStatus] = useState<ContractAmendment["status"]>("Vigente");
  const [autoUpdateContract, setAutoUpdateContract] = useState(true);

  // Computed selected contract helper
  const matchedContract = contracts.find((c) => c.contractNum === selectedContractNum);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const openNewModal = () => {
    setEditingAmendment(null);
    setSelectedContractNum(contracts[0]?.contractNum || "");
    setAmendmentNum("");
    setType("Acréscimo de Valor");
    setValueChange("");
    setNewEndDate("");
    setSignatureDate("");
    setPublicationDate("");
    setJustification("");
    setStatus("Vigente");
    setAutoUpdateContract(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item: ContractAmendment) => {
    setEditingAmendment(item);
    setSelectedContractNum(item.contractNum);
    setAmendmentNum(item.amendmentNum);
    setType(item.type);
    setValueChange(item.valueChange.toString());
    setNewEndDate(item.newEndDate || "");
    setSignatureDate(item.signatureDate);
    setPublicationDate(item.publicationDate || "");
    setJustification(item.justification);
    setStatus(item.status);
    setAutoUpdateContract(false);
    setIsModalOpen(true);
  };

  const handleContractSelect = (num: string) => {
    setSelectedContractNum(num);
    const target = contracts.find((c) => c.contractNum === num);
    if (target) {
      if (type === "Prorrogação de Prazo" && !newEndDate) {
        setNewEndDate(target.endDate);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContractNum) return;

    const currentContract = contracts.find((c) => c.contractNum === selectedContractNum);
    const creditorName = currentContract ? currentContract.creditor : "Credor Desconhecido";
    const numVal = parseFloat(valueChange) || 0;

    if (editingAmendment) {
      onUpdateAmendment(
        {
          ...editingAmendment,
          contractNum: selectedContractNum,
          creditor: creditorName,
          amendmentNum,
          type,
          valueChange: numVal,
          newEndDate: newEndDate || undefined,
          signatureDate,
          publicationDate: publicationDate || undefined,
          justification,
          status,
        },
        autoUpdateContract,
      );
    } else {
      onAddAmendment(
        {
          contractNum: selectedContractNum,
          creditor: creditorName,
          amendmentNum,
          type,
          valueChange: numVal,
          newEndDate: newEndDate || undefined,
          signatureDate,
          publicationDate: publicationDate || undefined,
          justification,
          status,
        },
        autoUpdateContract,
      );
    }

    setIsModalOpen(false);
  };

  const filteredAmendments = amendments.filter((a) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      a.amendmentNum.toLowerCase().includes(term) ||
      a.contractNum.toLowerCase().includes(term) ||
      a.creditor.toLowerCase().includes(term) ||
      a.justification.toLowerCase().includes(term);

    const matchesType = selectedType === "todos" || a.type === selectedType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 tracking-tight flex items-center space-x-2.5">
            <Layers className="w-7 h-7 text-emerald-600" />
            <span>Termos Aditivos dos Contratos</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestão e registro de prorrogações de prazo, reajustes e acréscimos aos contratos em
            vigência.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Termo Aditivo</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por contrato, aditivo, credor ou objeto..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-700 cursor-pointer"
          >
            <option value="todos">Todos os Tipos de Aditivo</option>
            <option value="Acréscimo de Valor">Acréscimo de Valor</option>
            <option value="Prorrogação de Prazo">Prorrogação de Prazo</option>
            <option value="Redução de Valor">Redução de Valor</option>
            <option value="Reajuste / Repactuação">Reajuste / Repactuação</option>
            <option value="Alteração Qualitativa">Alteração Qualitativa</option>
            <option value="Outros">Outros</option>
          </select>
        </div>

        <div className="text-xs font-medium text-slate-500">
          Total: <span className="font-medium text-slate-900">{filteredAmendments.length}</span>{" "}
          aditivos cadastrados
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-medium uppercase text-slate-600 tracking-wider">
                <th className="py-3.5 px-4">Termo Aditivo</th>
                <th className="py-3.5 px-4">Contrato Vinculado</th>
                <th className="py-3.5 px-4">Tipo do Aditivo</th>
                <th className="py-3.5 px-4">Impacto Financeiro</th>
                <th className="py-3.5 px-4">Nova Vigência</th>
                <th className="py-3.5 px-4">Assinatura / Publicação</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAmendments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-700 text-xs">
                      Nenhum termo aditivo encontrado.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Clique em "Cadastrar Termo Aditivo" para vincular um aditivo a um contrato.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAmendments.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                      {item.amendmentNum}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{item.contractNum}</div>
                      <div className="text-[11px] text-slate-500 font-medium">{item.creditor}</div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                          item.type === "Acréscimo de Valor"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : item.type === "Prorrogação de Prazo"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : item.type === "Redução de Valor"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-purple-50 text-purple-700 border-purple-200"
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium whitespace-nowrap">
                      {item.valueChange > 0 ? (
                        <span className="text-emerald-700 flex items-center space-x-1">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>+ {formatCurrency(item.valueChange)}</span>
                        </span>
                      ) : item.valueChange < 0 ? (
                        <span className="text-rose-600 flex items-center space-x-1">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          <span>- {formatCurrency(Math.abs(item.valueChange))}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">Sem alteração de valor</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {item.newEndDate ? (
                        <span className="text-blue-800 font-medium bg-blue-50/60 px-2 py-0.5 rounded border border-blue-100">
                          {item.newEndDate}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                      <div>Assinatura: {item.signatureDate}</div>
                      {item.publicationDate && (
                        <div className="text-[10px] text-slate-400">
                          Pub.: {item.publicationDate}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar Termo Aditivo"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteAmendment(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Termo Aditivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form for Adding/Editing Aditivo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-medium text-slate-800">
                  {editingAmendment ? "Editar Termo Aditivo" : "Lançar Novo Termo Aditivo"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Selecione o contrato e informe o tipo e os dados do aditivo
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Select Contract */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Selecione o Contrato Vinculado <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedContractNum}
                  onChange={(e) => handleContractSelect(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800 cursor-pointer"
                >
                  <option value="">-- Selecione o Contrato --</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.contractNum}>
                      {c.contractNum} - {c.creditor} ({formatCurrency(c.totalValue)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Matched Contract Info Card */}
              {matchedContract && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-xs space-y-1">
                  <div className="font-medium text-emerald-900 flex items-center justify-between">
                    <span>{matchedContract.creditor}</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-medium uppercase">
                      {matchedContract.category || "Contrato Ativo"}
                    </span>
                  </div>
                  <div className="text-slate-600 grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div>
                      <span className="text-slate-400 block uppercase font-medium text-[9px]">
                        Valor Atual:
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatCurrency(matchedContract.totalValue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block uppercase font-medium text-[9px]">
                        Vigência Atual:
                      </span>
                      <span className="font-medium text-slate-800">
                        {matchedContract.startDate} até {matchedContract.endDate}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Amendment Number and Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Número / Identificação do Aditivo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={amendmentNum}
                    onChange={(e) => setAmendmentNum(e.target.value)}
                    placeholder="Ex: 1º Termo Aditivo, AD-2025-001"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tipo de Aditivo <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  >
                    <option value="Acréscimo de Valor">Acréscimo de Valor</option>
                    <option value="Prorrogação de Prazo">Prorrogação de Prazo</option>
                    <option value="Redução de Valor">Redução de Valor</option>
                    <option value="Reajuste / Repactuação">Reajuste / Repactuação</option>
                    <option value="Alteração Qualitativa">Alteração Qualitativa</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              {/* Value change and New End Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor da Alteração (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={valueChange}
                    onChange={(e) => setValueChange(e.target.value)}
                    placeholder="Ex: 15000 (positivo) ou -5000 (redução)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Use valores positivos para acréscimo ou negativo para redução
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nova Data Término (Vigência)
                  </label>
                  <input
                    type="date"
                    value={brDateToInputDate(newEndDate)}
                    onChange={(e) => setNewEndDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Preencha se houver prorrogação de prazo
                  </span>
                </div>
              </div>

              {/* Dates: Signature & Publication */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Assinatura <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={brDateToInputDate(signatureDate)}
                    onChange={(e) => setSignatureDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Publicação (Diário Oficial)
                  </label>
                  <input
                    type="date"
                    value={brDateToInputDate(publicationDate)}
                    onChange={(e) => setPublicationDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Justification / Objeto */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa / Motivo do Termo Aditivo <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo do aditivo, fundamentação legal e alteração de escopo..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Auto update contract checkbox */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex items-center space-x-2.5">
                <input
                  type="checkbox"
                  id="autoUpdate"
                  checked={autoUpdateContract}
                  onChange={(e) => setAutoUpdateContract(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <label
                  htmlFor="autoUpdate"
                  className="text-xs text-slate-700 font-medium cursor-pointer select-none"
                >
                  Atualizar automaticamente o contrato com o novo valor ou nova data de término
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingAmendment ? "Atualizar Aditivo" : "Salvar Aditivo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
