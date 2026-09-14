import React, { useState, useEffect, useMemo } from "react";
import {
  Receipt,
  Plus,
  Link2,
  Link2Off,
  X,
  Search,
  Building2,
  Landmark,
  Trash2,
  Edit3,
} from "lucide-react";
import { ServiceNote, Contract, Creditor, Commitment } from "../types";

interface InvoicesViewProps {
  notes: ServiceNote[];
  contracts: Contract[];
  commitments: Commitment[];
  creditors?: Creditor[];
  onAddNote: (note: ServiceNote) => void;
  onUpdateNote?: (note: ServiceNote) => void;
  onDeleteNote: (note: ServiceNote) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  notes,
  contracts = [],
  commitments = [],
  creditors = [],
  onAddNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [noteNumber, setNoteNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [attestationDate, setAttestationDate] = useState("");
  const [fiscalName, setFiscalName] = useState("");
  const [contractNum, setContractNum] = useState("");
  const [creditor, setCreditor] = useState("");
  const [value, setValue] = useState("");
  const [commitmentId, setCommitmentId] = useState("");
  const [editingNote, setEditingNote] = useState<ServiceNote | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [contractFilter, setContractFilter] = useState("ALL");
  const [creditorFilter, setCreditorFilter] = useState("ALL");

  const registeredCompanies = useMemo(() => {
    const list: { id: string; name: string; cnpj?: string }[] = [];
    const seenNames = new Set<string>();

    creditors.forEach((c) => {
      if (c.name && !seenNames.has(c.name)) {
        seenNames.add(c.name);
        list.push({ id: c.id, name: c.name, cnpj: c.cnpj });
      }
    });

    contracts.forEach((c) => {
      if (c.creditor && !seenNames.has(c.creditor)) {
        seenNames.add(c.creditor);
        list.push({ id: `contract-cred-${c.id}`, name: c.creditor, cnpj: c.cnpj });
      }
    });

    return list;
  }, [creditors, contracts]);

  const allCompanyNames = useMemo(
    () => registeredCompanies.map((c) => c.name).sort(),
    [registeredCompanies],
  );
  const selectedCommitment = commitments.find((commitment) => commitment.id === commitmentId);
  const selectedContract = contracts.find((contract) => contract.contractNum === contractNum);
  const availableCommitments = useMemo(
    () =>
      [...commitments].sort((a, b) => a.number.localeCompare(b.number, "pt-BR", { numeric: true })),
    [commitments],
  );

  useEffect(() => {
    if (showModal) {
      if (editingNote) return;
      setNoteNumber("");
      setIssueDate("");
      setAttestationDate("");
      setFiscalName("");
      setContractNum("");
      setCreditor("");
      setValue("");
      setCommitmentId("");
    }
  }, [showModal, editingNote]);

  const handleEdit = (note: ServiceNote) => {
    setEditingNote(note);
    setNoteNumber(note.noteNumber);
    setIssueDate(note.issueDate || "");
    setAttestationDate(note.attestationDate || "");
    setFiscalName(note.fiscalName || "");
    setContractNum(note.contractNum || "");
    setCreditor(note.creditor || "");
    setValue(String(note.value || ""));
    setCommitmentId(
      note.commitmentId ||
        commitments.find((item) => item.number === note.commitmentNumber)?.id ||
        "",
    );
    setShowModal(true);
  };

  const handleContractChange = (selectedContractNum: string) => {
    setContractNum(selectedContractNum);
    const matched = contracts.find((c) => c.contractNum === selectedContractNum);
    if (matched?.creditor) {
      setCreditor(matched.creditor);
    }
    setFiscalName(matched?.fiscalName || "");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const noteValue = parseFloat(value) || 0;
    const parsedCommitmentValue = selectedCommitment?.value || 0;
    const sameCommitmentCredit =
      editingNote && editingNote.commitmentId === selectedCommitment?.id ? editingNote.value : 0;
    const parsedCommitmentBalance =
      (selectedCommitment?.currentBalance ?? selectedCommitment?.balance ?? 0) +
      sameCommitmentCredit;
    const currentBalance = parsedCommitmentBalance - noteValue;

    const nextNote = {
      id: editingNote?.id || `n-${Date.now()}`,
      noteNumber,
      contractNum: contractNum || "Contrato Não Selecionado",
      creditor: creditor || "Credor Não Identificado",
      issueDate,
      attestationDate,
      fiscalName,
      value: noteValue,
      status: attestationDate ? "Concluido" : "Pendente",
      budgetAllocation: selectedCommitment?.budgetAllocation || "",
      program: selectedCommitment?.program || "",
      commitmentNumber: selectedCommitment?.number || "",
      commitmentValue: parsedCommitmentValue,
      commitmentBalance: parsedCommitmentBalance,
      currentBalance,
      commitmentId,
    };

    if (editingNote && onUpdateNote) {
      onUpdateNote(nextNote);
    } else {
      onAddNote(nextNote);
    }

    setEditingNote(null);
    setShowModal(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
  };

  const parseDateValue = (dateText?: string) => {
    if (!dateText) return Number.MAX_SAFE_INTEGER;
    const br = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
    const parsed = new Date(dateText).getTime();
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
  };

  const previewCurrentBalance =
    (selectedCommitment?.currentBalance ?? selectedCommitment?.balance ?? 0) -
    (parseFloat(value) || 0);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          n.noteNumber.toLowerCase().includes(term) ||
          n.contractNum.toLowerCase().includes(term) ||
          n.creditor.toLowerCase().includes(term) ||
          (n.fiscalName || "").toLowerCase().includes(term) ||
          (n.budgetAllocation || "").toLowerCase().includes(term) ||
          (n.program || "").toLowerCase().includes(term) ||
          (n.commitmentNumber || "").toLowerCase().includes(term);

        const matchesContract = contractFilter === "ALL" || n.contractNum === contractFilter;
        const matchesCreditor = creditorFilter === "ALL" || n.creditor === creditorFilter;

        return matchesSearch && matchesContract && matchesCreditor;
      })
      .sort((a, b) => parseDateValue(a.attestationDate) - parseDateValue(b.attestationDate));
  }, [notes, searchTerm, contractFilter, creditorFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium text-slate-900">Notas de Serviço</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lançamento de notas vinculadas ao contrato, fiscal e empenho.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-4 py-2.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Lançar Nota de Serviço</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar nota, contrato, empresa ou fiscal..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center space-x-1.5 text-xs bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl">
            <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Contratos</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.contractNum}>
                  {c.contractNum}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5 text-xs bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={creditorFilter}
              onChange={(e) => setCreditorFilter(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Empresas / Credores</option>
              {allCompanyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium uppercase tracking-wider">
                <th className="py-3 px-4">Número da Nota</th>
                <th className="py-3 px-4">Contrato Vinculado</th>
                <th className="py-3 px-4">Vínculo</th>
                <th className="py-3 px-4">Credor / Empresa</th>
                <th className="py-3 px-4">Datas / Fiscal</th>
                <th className="py-3 px-4">Dotação</th>
                <th className="py-3 px-4">Programa</th>
                <th className="py-3 px-4">Empenho</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4">Saldo Atual</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-slate-400 italic">
                    Nenhuma nota fiscal encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredNotes.map((n) => {
                  const isLinked = contracts.some(
                    (c) =>
                      c.contractNum.toLowerCase().trim() === n.contractNum.toLowerCase().trim(),
                  );

                  return (
                    <tr key={n.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-purple-700 whitespace-nowrap">
                        <span className="flex items-center space-x-1.5">
                          <Receipt className="w-3.5 h-3.5 text-purple-500" />
                          <span>{n.noteNumber}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {n.contractNum}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isLinked ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            <Link2 className="w-3 h-3" />
                            <span>VINCULADA</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            <Link2Off className="w-3 h-3" />
                            <span>SEM CONTRATO</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">{n.creditor}</td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p>Emissão: {n.issueDate || "-"}</p>
                          <p>Atesto: {n.attestationDate || "-"}</p>
                          <p className="font-medium text-slate-800">
                            Fiscal: {n.fiscalName || "-"}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {n.budgetAllocation || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 min-w-64">
                        <p className="line-clamp-2" title={n.program || ""}>
                          {n.program || "-"}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-800">{n.commitmentNumber || "-"}</p>
                          <p className="text-[10px] text-slate-500">
                            Empenho: {formatCurrency(n.commitmentValue || 0)}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {formatCurrency(n.value)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5 text-right">
                          <p className="text-[10px] text-slate-500">
                            Antes: {formatCurrency(n.commitmentBalance || 0)}
                          </p>
                          <p
                            className={`font-medium ${(n.currentBalance || 0) < 0 ? "text-rose-600" : "text-emerald-700"}`}
                          >
                            {formatCurrency(n.currentBalance || 0)}
                          </p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                            n.status === "Paga" || n.status === "Concluido"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : n.status === "Pendente"
                                ? "bg-amber-50 text-amber-700 border border-amber-100"
                                : "bg-purple-50 text-purple-700 border border-purple-100"
                          }`}
                        >
                          {n.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {onUpdateNote && (
                          <button
                            onClick={() => handleEdit(n)}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 mr-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg transition-colors cursor-pointer"
                            title="Editar nota"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Deseja excluir a nota ${n.noteNumber}? O valor volta para o saldo do empenho vinculado.`,
                              )
                            ) {
                              onDeleteNote(n);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 bg-rose-100/70 hover:bg-rose-200/80 border border-rose-200/80 rounded-lg transition-colors cursor-pointer"
                          title="Excluir nota"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-2xl animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-medium text-slate-900">
                  {editingNote ? "Editar Nota de Serviço" : "Lançar Nota de Serviço"}
                </h3>
                <p className="text-[11px] text-slate-500">
                  O empenho selecionado preenche dotação, programa e saldo.
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingNote(null);
                  setShowModal(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Número da Nota Fiscal (NF) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={noteNumber}
                  onChange={(e) => setNoteNumber(e.target.value)}
                  placeholder="Ex: NF-203443 ou 10452"
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contrato <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={contractNum}
                  onChange={(e) => handleContractChange(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800 cursor-pointer"
                >
                  <option value="">-- Selecione o contrato --</option>
                  {contracts.length > 0 ? (
                    contracts.map((c) => (
                      <option key={c.id} value={c.contractNum}>
                        {c.contractNum} - {c.creditor} ({c.category})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      Nenhum contrato cadastrado
                    </option>
                  )}
                </select>
              </div>

              {selectedContract && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="block text-[10px] font-medium uppercase text-slate-400">
                    Nome do fiscal
                  </span>
                  <span className="font-medium text-slate-900">
                    {selectedContract.fiscalName || "Fiscal não informado"}
                  </span>
                  {selectedContract.fiscalPortaria && (
                    <span className="ml-2 text-slate-500">
                      Portaria {selectedContract.fiscalPortaria}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Empresa / Credor <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={creditor}
                  onChange={(e) => setCreditor(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800 cursor-pointer"
                >
                  <option value="">-- Selecione a empresa / credor --</option>
                  {registeredCompanies.length > 0 ? (
                    registeredCompanies.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} {c.cnpj ? `- CNPJ: ${c.cnpj}` : ""}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      Nenhuma empresa cadastrada
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Empenho <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={commitmentId}
                  onChange={(e) => setCommitmentId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800 cursor-pointer"
                >
                  <option value="">-- Selecione o empenho --</option>
                  {availableCommitments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.number} - {item.budgetAllocation} - saldo{" "}
                      {formatCurrency(item.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCommitment ? (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Dotação
                    </span>
                    <span className="font-medium text-slate-900">
                      {selectedCommitment.budgetAllocation}
                    </span>
                  </div>
                  <div className="md:col-span-3">
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Programa
                    </span>
                    <span className="font-medium text-slate-900">{selectedCommitment.program}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Valor do empenho
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(selectedCommitment.value)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Saldo antes
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(selectedCommitment.currentBalance)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Desconto
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(parseFloat(value) || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-medium uppercase text-emerald-700">
                      Saldo atual
                    </span>
                    <span
                      className={`font-medium ${previewCurrentBalance < 0 ? "text-rose-600" : "text-emerald-700"}`}
                    >
                      {formatCurrency(previewCurrentBalance)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-medium">
                  Selecione um empenho para puxar dotação, programa, valor e saldo automaticamente.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Valor da Nota (R$) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Emissão
                  </label>
                  <input
                    type="text"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    placeholder="Ex: 28/07/2026"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data de Atesto
                  </label>
                  <input
                    type="text"
                    value={attestationDate}
                    onChange={(e) => setAttestationDate(e.target.value)}
                    placeholder="Ex: 29/07/2026"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fiscal Responsável
                  </label>
                  <input
                    type="text"
                    value={fiscalName}
                    onChange={(e) => setFiscalName(e.target.value)}
                    placeholder="Nome do fiscal"
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg outline-none font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingNote(null);
                    setShowModal(false);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 font-medium rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {editingNote ? "Atualizar Nota" : "Confirmar Lançamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
