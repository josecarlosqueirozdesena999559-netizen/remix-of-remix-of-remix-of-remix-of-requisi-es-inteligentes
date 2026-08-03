import React, { useState } from "react";
import { Users, Plus, Building2, Search, Trash2, Edit3 } from "lucide-react";
import { Creditor } from "../types";

interface CreditorsViewProps {
  creditors: Creditor[];
  onAddCreditor: (creditor: Creditor) => void;
  onUpdateCreditor?: (creditor: Creditor) => void;
  onDeleteCreditor?: (id: string) => void;
}

export const CreditorsView: React.FC<CreditorsViewProps> = ({
  creditors,
  onAddCreditor,
  onUpdateCreditor,
  onDeleteCreditor,
}) => {
  const [filterText, setFilterText] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [category, setCategory] = useState("Credor");
  const [status, setStatus] = useState("Ativo");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCreditor, setEditingCreditor] = useState<Creditor | null>(null);

  const filtered = creditors.filter(
    (c) => c.name.toLowerCase().includes(filterText.toLowerCase()) || c.cnpj.includes(filterText),
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cnpj) return;

    if (editingCreditor && onUpdateCreditor) {
      onUpdateCreditor({
        ...editingCreditor,
        name,
        cnpj,
        category,
        status: status as Creditor["status"],
      });
    } else {
      onAddCreditor({
        id: `c-${Date.now()}`,
        name,
        cnpj,
        category,
        activeContractsCount: 0,
        totalValue: 0,
        status: status as Creditor["status"],
      });
    }

    setName("");
    setCnpj("");
    setCategory("Credor");
    setStatus("Ativo");
    setEditingCreditor(null);
    setShowAddModal(false);
  };

  const openCreateModal = () => {
    setEditingCreditor(null);
    setName("");
    setCnpj("");
    setCategory("Credor");
    setStatus("Ativo");
    setShowAddModal(true);
  };

  const openEditModal = (cred: Creditor) => {
    setEditingCreditor(cred);
    setName(cred.name);
    setCnpj(cred.cnpj);
    setCategory(cred.category || "Credor");
    setStatus(cred.status);
    setShowAddModal(true);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium text-slate-800">Credores & Fornecedores</h2>
          <p className="text-xs text-slate-500 mt-1">
            Gestão cadastral de empresas e prestadores de serviços contratados
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center space-x-2 px-4 py-2.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Credor</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Buscar por Razão Social ou CNPJ..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                <th className="py-3 px-4">Razão Social</th>
                <th className="py-3 px-4">CNPJ</th>
                <th className="py-3 px-4">Contratos Ativos</th>
                <th className="py-3 px-4">Valor Acumulado</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 italic">
                    Nenhum credor ou fornecedor cadastrado no momento.
                  </td>
                </tr>
              ) : (
                filtered.map((cred) => (
                  <tr key={cred.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <span>{cred.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium font-mono">
                      {cred.cnpj}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">
                      {cred.activeContractsCount} contratos
                    </td>
                    <td className="py-3.5 px-4 font-medium text-emerald-700">
                      {formatCurrency(cred.totalValue)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {cred.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {onUpdateCreditor && (
                        <button
                          onClick={() => openEditModal(cred)}
                          className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar credor"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {onDeleteCreditor && (
                        <button
                          onClick={() => setDeletingId(cred.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir credor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-medium text-slate-800">Excluir Credor</h3>
              <p className="text-xs text-slate-500 mt-1">
                Tem certeza que deseja excluir este credor do sistema? Esta ação não pode ser
                desfeita.
              </p>
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteCreditor && deletingId) {
                    onDeleteCreditor(deletingId);
                  }
                  setDeletingId(null);
                }}
                className="flex-1 px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-base font-medium text-slate-800">
                  {editingCreditor ? "Editar Credor / Empresa" : "Cadastrar Novo Credor / Empresa"}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Preencha os dados cadastrais manualmente
                </p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  CNPJ da Empresa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Razão Social / Nome da Empresa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Digite a razão social..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Status / Situação Cadastral
                </label>
                <input
                  type="text"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-emerald-700"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCreditor(null);
                    setShowAddModal(false);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs cursor-pointer"
                >
                  {editingCreditor ? "Atualizar Credor" : "Salvar Credor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
