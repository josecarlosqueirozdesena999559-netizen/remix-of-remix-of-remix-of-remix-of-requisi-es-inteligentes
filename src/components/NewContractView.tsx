import React, { useState } from "react";
import {
  FilePlus,
  Check,
  ArrowLeft,
  RotateCcw,
  UserCheck,
  ShieldCheck,
  FileCheck,
  Landmark,
  Users,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { Contract, ContractItem, ContractStatus, FiscalPortaria, Creditor } from "../types";
import { brDateToInputDate, inputDateToBRDate } from "../utils/dateFormat";

interface NewContractViewProps {
  fiscais?: FiscalPortaria[];
  creditors?: Creditor[];
  categories?: string[];
  editingContract?: Contract | null;
  onAddCategory?: (category: string) => void;
  onAddContract: (contract: Omit<Contract, "id">) => void;
  onUpdateContract?: (contract: Contract) => void;
  onCancel: () => void;
}

export const NewContractView: React.FC<NewContractViewProps> = ({
  fiscais = [],
  creditors = [],
  categories = [],
  editingContract = null,
  onAddCategory,
  onAddContract,
  onUpdateContract,
  onCancel,
}) => {
  const isEditing = Boolean(editingContract);
  const [contractNum, setContractNum] = useState(editingContract?.contractNum || "");
  const [creditor, setCreditor] = useState(editingContract?.creditor || "");
  const [object, setObject] = useState(editingContract?.object || "");
  const [startDate, setStartDate] = useState(editingContract?.startDate || "");
  const [endDate, setEndDate] = useState(editingContract?.endDate || "");
  const [totalValue, setTotalValue] = useState(
    editingContract ? String(editingContract.totalValue) : "",
  );
  const [status, setStatus] = useState<ContractStatus>(editingContract?.status || "Ativo");
  const [category, setCategory] = useState(
    editingContract?.category || "Secretaria Municipal de Saúde",
  );

  // Fiscal and Portaria fields
  const [selectedFiscalId, setSelectedFiscalId] = useState(() => {
    if (!editingContract) return "";
    return (
      fiscais.find(
        (f) =>
          f.name === editingContract.fiscalName && f.portaria === editingContract.fiscalPortaria,
      )?.id || ""
    );
  });
  const [fiscalName, setFiscalName] = useState(editingContract?.fiscalName || "");
  const [fiscalPortaria, setFiscalPortaria] = useState(editingContract?.fiscalPortaria || "");
  const [fiscalPortariaPublicationDate, setFiscalPortariaPublicationDate] = useState(
    editingContract?.fiscalPortariaPublicationDate || "",
  );
  const [fiscalPortariaValidity, setFiscalPortariaValidity] = useState(
    editingContract?.fiscalPortariaValidity || "",
  );
  const [items, setItems] = useState<ContractItem[]>(editingContract?.items || []);
  const [itemDescription, setItemDescription] = useState("");
  const [itemUnit, setItemUnit] = useState("UN");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemUnitValue, setItemUnitValue] = useState("");

  const [successMessage, setSuccessMessage] = useState(false);

  const defaultCategories = ["Secretaria Municipal de Saúde", "Fundo Municipal de Saúde"];

  const categoryOptions = defaultCategories;

  const handleSelectCreditor = (creditorName: string) => {
    if (!creditorName) return;
    setCreditor(creditorName);
  };

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

  const contractItemsTotal = items.reduce((sum, item) => sum + item.quantity * item.unitValue, 0);
  const currentItemTotal = (parseFloat(itemQuantity) || 0) * (parseFloat(itemUnitValue) || 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleAddItem = () => {
    const description = itemDescription.trim();
    const quantity = parseFloat(itemQuantity) || 0;
    const unitValue = parseFloat(itemUnitValue) || 0;

    if (!description || quantity <= 0 || unitValue < 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        description,
        unit: itemUnit.trim() || "UN",
        quantity,
        unitValue,
      },
    ]);
    setItemDescription("");
    setItemUnit("UN");
    setItemQuantity("");
    setItemUnitValue("");
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractNum || !creditor || !object) return;

    const contractData = {
      contractNum,
      creditor,
      object,
      startDate,
      endDate,
      totalValue: parseFloat(totalValue) || 0,
      usedValue: editingContract?.usedValue || 0,
      status,
      category,
      fiscalName,
      fiscalPortaria,
      fiscalPortariaPublicationDate,
      fiscalPortariaValidity,
      items,
    };

    if (editingContract && onUpdateContract) {
      onUpdateContract({
        ...editingContract,
        ...contractData,
      });
    } else {
      onAddContract(contractData);
    }

    setSuccessMessage(true);
    setTimeout(() => {
      setSuccessMessage(false);
      onCancel();
    }, 1500);
  };

  const handleReset = () => {
    setContractNum("");
    setCreditor("");
    setObject("");
    setStartDate("");
    setEndDate("");
    setTotalValue("");
    setStatus("Ativo");
    setCategory("Secretaria Municipal de Saúde");
    setSelectedFiscalId("");
    setFiscalName("");
    setFiscalPortaria("");
    setFiscalPortariaPublicationDate("");
    setFiscalPortariaValidity("");
    setItems([]);
    setItemDescription("");
    setItemUnit("UN");
    setItemQuantity("");
    setItemUnitValue("");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn pb-12">
      {/* Header with back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={onCancel}
            className="group flex items-center space-x-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar ao Dashboard</span>
          </button>
          <h1 className="text-2xl font-medium tracking-tight text-slate-900 flex items-center gap-2">
            <span>{isEditing ? "Editar Contrato" : "Lançar Novo Contrato"}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isEditing
              ? "Atualize os dados do contrato, vigência, valores e os dados da portaria do fiscal responsável."
              : "Preencha os dados do contrato, vigência, valores e os dados da portaria do fiscal responsável."}
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-600 text-white p-4 rounded-xl text-xs font-medium flex items-center space-x-2 animate-fadeIn shadow-xs">
          <Check className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>
            {isEditing
              ? "Contrato atualizado com sucesso! Redirecionando..."
              : "Contrato cadastrado com sucesso! Redirecionando..."}
          </span>
        </div>
      )}

      {/* Main Form Container */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-medium text-slate-900">
            {isEditing
              ? "Formulário de Edição de Contrato"
              : "Formulário de Lançamento de Contrato"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-7">
          {/* SECTION 1: Identificação do Instrumento */}
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-800 uppercase tracking-wider">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span>1. Órgão e Empresa / Credor Contratado</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Número do Contrato <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contractNum}
                  onChange={(e) => setContractNum(e.target.value)}
                  placeholder="Ex: CT-2025-0012 ou 012/2025"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Órgão Responsável / Categoria Contratante <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium cursor-pointer"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="block text-xs font-medium text-slate-700">
                Empresa / Credor Contratado <span className="text-rose-500">*</span>
              </label>

              {creditors.length > 0 ? (
                <select
                  required
                  value={creditor}
                  onChange={(e) => handleSelectCreditor(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 cursor-pointer"
                >
                  <option value="">-- Selecione a Empresa / Credor Cadastrado --</option>
                  {creditors.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} {c.tradeName ? `(${c.tradeName})` : ""} - CNPJ: {c.cnpj}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  Nenhum credor/empresa cadastrado no sistema. Cadastre a empresa na aba{" "}
                  <strong>Credores</strong> primeiro.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Objeto do Contrato <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={object}
                onChange={(e) => setObject(e.target.value)}
                placeholder="Descreva detalhadamente o objeto, serviços contratados ou fornecimento de materiais..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed text-slate-800"
              />
            </div>
          </div>

          {/* SECTION 2: Vigência e Valor */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <span>2. Vigência e Valor Global do Contrato</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Vigência - Data Início <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={brDateToInputDate(startDate)}
                  onChange={(e) => setStartDate(inputDateToBRDate(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Vigência - Data Término <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={brDateToInputDate(endDate)}
                  onChange={(e) => setEndDate(inputDateToBRDate(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Valor Total do Contrato (R$) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                  placeholder="Ex: 150000"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Status Inicial
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContractStatus)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 font-medium cursor-pointer"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="A Vencer">A Vencer</option>
                  <option value="Suspenso">Suspenso</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-800 uppercase tracking-wider">
                <FilePlus className="w-4 h-4 text-emerald-600" />
                <span>3. Itens do Contrato</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-700">
                Total dos itens: {formatCurrency(contractItemsTotal)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_90px_110px_130px_130px_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Descrição do Item
                </label>
                <input
                  type="text"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Ex: Medicamento, material ou serviço"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Unidade</label>
                <input
                  type="text"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                  placeholder="UN"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Quantidade
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Valor Unitário
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemUnitValue}
                  onChange={(e) => setItemUnitValue(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Total do Item
                </label>
                <div className="w-full px-3.5 py-2.5 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-900 font-medium">
                  {formatCurrency(currentItemTotal)}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar</span>
              </button>
            </div>

            {items.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                    <tr>
                      <th className="px-3 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-center">Un.</th>
                      <th className="px-3 py-2.5 text-right">Qtd.</th>
                      <th className="px-3 py-2.5 text-right">Valor Unit.</th>
                      <th className="px-3 py-2.5 text-right">Total</th>
                      <th className="px-3 py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="px-3 py-2.5 font-medium text-slate-800">
                          {item.description}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600">{item.unit}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          {item.quantity.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-700">
                          {formatCurrency(item.unitValue)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                          {formatCurrency(item.quantity * item.unitValue)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="inline-flex items-center justify-end gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Remover item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setTotalValue(String(contractItemsTotal))}
                className="inline-flex items-center px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer"
              >
                Usar total dos itens como valor do contrato
              </button>
            )}
          </div>

          {/* SECTION 3: Dados do Fiscal e Portaria */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2 text-xs font-medium text-slate-800 uppercase tracking-wider">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>4. Fiscalização do Contrato & Portaria</span>
              </div>
            </div>

            {fiscais.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Fiscal do Contrato Cadastrado <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedFiscalId}
                  onChange={(e) => handleSelectFiscal(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-900 cursor-pointer"
                >
                  <option value="">
                    -- Selecione o Fiscal Cadastrado na aba Fiscais & Portarias --
                  </option>
                  {fiscais.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.portaria}) - {f.organ || "Saúde"}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                Nenhum fiscal cadastrado no sistema. Cadastre o fiscal e a portaria na aba{" "}
                <strong>Fiscais & Portarias</strong> primeiro.
              </div>
            )}

            {fiscalName && (
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Fiscal Designado
                  </span>
                  <span className="font-medium text-slate-900">{fiscalName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-medium text-slate-400 block">
                    Portaria nº
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
                    Vigência Portaria
                  </span>
                  <span className="font-medium text-slate-900">
                    {fiscalPortariaValidity || "N/A"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Form Action Buttons */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center space-x-1 px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isEditing ? "Limpar edição" : "Limpar Campos"}</span>
            </button>

            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-6 py-2.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isEditing ? "Salvar Alterações" : "Salvar e Gravar Contrato"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
