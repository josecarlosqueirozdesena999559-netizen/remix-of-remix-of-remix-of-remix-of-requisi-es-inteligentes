import React, { useState } from "react";
import { X, FilePlus, Check, UserCheck, Landmark, Users, Plus } from "lucide-react";
import { Contract, ContractStatus, FiscalPortaria, Creditor } from "../types";
import { brDateToInputDate, inputDateToBRDate } from "../utils/dateFormat";

interface NewContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddContract: (contract: Omit<Contract, "id">) => void;
  fiscais?: FiscalPortaria[];
  creditors?: Creditor[];
  categories?: string[];
  onAddCategory?: (category: string) => void;
}

export const NewContractModal: React.FC<NewContractModalProps> = ({
  isOpen,
  onClose,
  onAddContract,
  fiscais = [],
  creditors = [],
  categories = [],
  onAddCategory,
}) => {
  const [contractNum, setContractNum] = useState("");
  const [creditor, setCreditor] = useState("");
  const [object, setObject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [status, setStatus] = useState<ContractStatus>("Ativo");
  const [category, setCategory] = useState("Secretaria Municipal de Saúde");

  const [selectedFiscalId, setSelectedFiscalId] = useState("");
  const [fiscalName, setFiscalName] = useState("");
  const [fiscalPortaria, setFiscalPortaria] = useState("");
  const [fiscalPortariaPublicationDate, setFiscalPortariaPublicationDate] = useState("");
  const [fiscalPortariaValidity, setFiscalPortariaValidity] = useState("");

  const defaultCategories = ["Secretaria Municipal de Saúde", "Fundo Municipal de Saúde"];

  const categoryOptions = defaultCategories;

  const handleSelectCreditor = (creditorName: string) => {
    if (!creditorName) return;
    setCreditor(creditorName);
  };

  if (!isOpen) return null;

  const handleSelectFiscal = (fiscalId: string) => {
    setSelectedFiscalId(fiscalId);
    const found = fiscais.find((f) => f.id === fiscalId);
    if (found) {
      setFiscalName(found.name);
      setFiscalPortaria(found.portaria);
      setFiscalPortariaPublicationDate(found.publicationDate);
      setFiscalPortariaValidity(found.validity);
    } else {
      setFiscalName("");
      setFiscalPortaria("");
      setFiscalPortariaPublicationDate("");
      setFiscalPortariaValidity("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNum || !creditor || !object) return;

    onAddContract({
      contractNum,
      creditor,
      object,
      startDate,
      endDate,
      totalValue: parseFloat(totalValue) || 0,
      status,
      category,
      fiscalName,
      fiscalPortaria,
      fiscalPortariaPublicationDate,
      fiscalPortariaValidity,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-base font-medium text-slate-800">Lançar Novo Contrato</h3>
            <p className="text-xs text-slate-500">
              Cadastre o contrato, vigência e a portaria do fiscal
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nº do Contrato <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={contractNum}
                onChange={(e) => setContractNum(e.target.value)}
                placeholder="Ex: CT-2025-0012 ou 012/2025"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Órgão Responsável / Categoria <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Empresa / Credor Contratado <span className="text-rose-500">*</span>
            </label>
            {creditors.length > 0 ? (
              <select
                required
                value={creditor}
                onChange={(e) => handleSelectCreditor(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 cursor-pointer"
              >
                <option value="">-- Selecione a Empresa / Credor Cadastrado --</option>
                {creditors.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} {c.tradeName ? `(${c.tradeName})` : ""} - CNPJ: {c.cnpj}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Nenhuma empresa cadastrada. Cadastre a empresa na aba <strong>Credores</strong>{" "}
                primeiro.
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Objeto do Contrato <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={object}
              onChange={(e) => setObject(e.target.value)}
              placeholder="Descreva resumidamente os serviços ou materiais contratados..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Data Início (Vigência)
              </label>
              <input
                type="date"
                required
                value={brDateToInputDate(startDate)}
                onChange={(e) => setStartDate(inputDateToBRDate(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Data Término (Vigência)
              </label>
              <input
                type="date"
                required
                value={brDateToInputDate(endDate)}
                onChange={(e) => setEndDate(inputDateToBRDate(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Valor Total (R$)
              </label>
              <input
                type="number"
                required
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="Ex: 150000"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Status Inicial
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ContractStatus)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="Ativo">Ativo</option>
                <option value="A Vencer">A Vencer</option>
                <option value="Suspenso">Suspenso</option>
              </select>
            </div>
          </div>

          {/* Fiscal e Portaria */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-medium text-slate-800 flex items-center justify-between uppercase tracking-wider">
              <span className="flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Fiscalização do Contrato & Portaria</span>
              </span>
            </h4>

            {fiscais.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fiscal do Contrato Cadastrado <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedFiscalId}
                  onChange={(e) => handleSelectFiscal(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 cursor-pointer"
                >
                  <option value="">
                    -- Selecione o Fiscal Cadastrado na aba Fiscais & Portarias --
                  </option>
                  {fiscais.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.portaria})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                Nenhum fiscal cadastrado. Cadastre os fiscais e portarias na aba{" "}
                <strong>Fiscais & Portarias</strong> primeiro.
              </div>
            )}

            {fiscalName && (
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Fiscal Designado
                  </span>
                  <span className="font-medium text-slate-900">{fiscalName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Portaria
                  </span>
                  <span className="font-medium text-slate-900">{fiscalPortaria || "N/A"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Data Publicação
                  </span>
                  <span className="font-medium text-slate-900">
                    {fiscalPortariaPublicationDate || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Vigência
                  </span>
                  <span className="font-medium text-slate-900">
                    {fiscalPortariaValidity || "N/A"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Form Action Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar Contrato</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
