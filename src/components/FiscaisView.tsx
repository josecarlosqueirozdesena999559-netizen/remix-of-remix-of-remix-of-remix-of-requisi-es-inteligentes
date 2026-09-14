import React, { useState } from "react";
import {
  UserCheck,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  X,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { FiscalPortaria } from "../types";
import { brDateToInputDate, inputDateToBRDate } from "../utils/dateFormat";

interface FiscaisViewProps {
  fiscais: FiscalPortaria[];
  onAddFiscal: (fiscal: Omit<FiscalPortaria, "id">) => void;
  onDeleteFiscal: (id: string) => void;
  onUpdateFiscal: (fiscal: FiscalPortaria) => void;
}

export const FiscaisView: React.FC<FiscaisViewProps> = ({
  fiscais,
  onAddFiscal,
  onDeleteFiscal,
  onUpdateFiscal,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFiscal, setEditingFiscal] = useState<FiscalPortaria | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [portaria, setPortaria] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [validity, setValidity] = useState("");
  const [organ, setOrgan] = useState<"Secretaria de Saúde" | "Fundo Municipal de Saúde">(
    "Secretaria de Saúde",
  );

  const openNewModal = () => {
    setEditingFiscal(null);
    setName("");
    setPortaria("");
    setPublicationDate("");
    setValidity("");
    setOrgan("Secretaria de Saúde");
    setIsModalOpen(true);
  };

  const openEditModal = (item: FiscalPortaria) => {
    setEditingFiscal(item);
    setName(item.name);
    setPortaria(item.portaria);
    setPublicationDate(item.publicationDate);
    setValidity(item.validity);
    setOrgan(
      (item.organ as "Secretaria de Saúde" | "Fundo Municipal de Saúde") || "Secretaria de Saúde",
    );
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFiscal) {
      onUpdateFiscal({
        ...editingFiscal,
        name,
        portaria,
        publicationDate,
        validity,
        organ,
      });
    } else {
      onAddFiscal({
        name,
        portaria,
        publicationDate,
        validity,
        organ,
      });
    }
    setIsModalOpen(false);
  };

  const filteredFiscais = fiscais.filter((f) => {
    const term = searchTerm.toLowerCase();
    return (
      f.name.toLowerCase().includes(term) ||
      f.portaria.toLowerCase().includes(term) ||
      (f.organ && f.organ.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-slate-900 tracking-tight flex items-center space-x-2.5">
            <UserCheck className="w-7 h-7 text-emerald-600" />
            <span>Fiscais de Contrato & Portarias</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre e gerencie os fiscais nomeados e suas respectivas portarias oficiais.
          </p>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Fiscal</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, portaria ou órgão..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="text-xs font-medium text-slate-500">
          Total: <span className="font-medium text-slate-900">{filteredFiscais.length}</span>{" "}
          fiscais cadastrados
        </div>
      </div>

      {/* Table List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-medium uppercase text-slate-600 tracking-wider">
                <th className="py-3.5 px-4">Nome do Fiscal</th>
                <th className="py-3.5 px-4">Portaria Designada</th>
                <th className="py-3.5 px-4">Órgão / Categoria</th>
                <th className="py-3.5 px-4">Data Publicação</th>
                <th className="py-3.5 px-4">Vigência da Portaria</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFiscais.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <UserCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium text-slate-700 text-xs">
                      Nenhum fiscal ou portaria cadastrada.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Clique no botão acima para cadastrar o primeiro fiscal.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredFiscais.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">{item.name}</td>
                    <td className="py-3.5 px-4 font-medium text-emerald-800">{item.portaria}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {item.organ || "Secretaria de Saúde"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {item.publicationDate || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-medium">
                      {item.validity || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar Fiscal"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteFiscal(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Fiscal"
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

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-sm font-medium text-slate-800">
                  {editingFiscal ? "Editar Fiscal / Portaria" : "Cadastrar Novo Fiscal"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Preencha os dados do servidor responsável e portaria
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do Fiscal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Dr. Roberto Carlos da Silva"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Órgão / Categoria
                </label>
                <select
                  value={organ}
                  onChange={(e) => setOrgan(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800"
                >
                  <option value="Secretaria de Saúde">Secretaria de Saúde</option>
                  <option value="Fundo Municipal de Saúde">Fundo Municipal de Saúde</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Portaria do Fiscal (Número / Ano) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={portaria}
                  onChange={(e) => setPortaria(e.target.value)}
                  placeholder="Ex: Portaria FMS nº 042/2025"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Publicação
                  </label>
                  <input
                    type="date"
                    value={brDateToInputDate(publicationDate)}
                    onChange={(e) => setPublicationDate(inputDateToBRDate(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Vigência da Portaria
                  </label>
                  <input
                    type="date"
                    value={brDateToInputDate(validity)}
                    onChange={(e) => setValidity(inputDateToBRDate(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
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
                  <span>{editingFiscal ? "Atualizar Fiscal" : "Salvar Fiscal"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
