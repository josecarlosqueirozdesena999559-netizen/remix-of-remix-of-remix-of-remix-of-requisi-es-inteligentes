import React, { useMemo } from "react";
import { AlertTriangle, CalendarClock, ClipboardList } from "lucide-react";
import { Contract, ServiceNote } from "../types";
import { formatBRDate, parseBRDate } from "../utils/dateFormat";

interface ContractControlViewProps {
  contracts: Contract[];
  notes: ServiceNote[];
}

const getDaysUntil = (dateValue: string) => {
  const target = parseBRDate(dateValue);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export const ContractControlView: React.FC<ContractControlViewProps> = ({ contracts, notes }) => {
  const rows = useMemo(() => {
    return contracts
      .map((contract) => {
        const notesTotal = notes
          .filter(
            (note) =>
              note.contractNum?.toLowerCase().trim() === contract.contractNum.toLowerCase().trim(),
          )
          .reduce((sum, note) => sum + note.value, 0);
        const used = Math.max(contract.usedValue || 0, notesTotal);
        const balance = Math.max(0, contract.totalValue - used);
        const daysRemaining = getDaysUntil(contract.endDate);

        return {
          contract,
          balance,
          daysRemaining,
          isOutOfBalance: balance <= 0 || used >= contract.totalValue,
          sortTime: parseBRDate(contract.endDate)?.getTime() ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.sortTime - b.sortTime);
  }, [contracts, notes]);

  const outOfBalanceCount = rows.filter((row) => row.isOutOfBalance).length;
  const expiringCount = rows.filter(
    (row) => row.daysRemaining !== null && row.daysRemaining >= 0 && row.daysRemaining <= 60,
  ).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-emerald-600" />
            <span>Controle de Contratos</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Acompanhamento para o fiscal, sem alterar contratos cadastrados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Contratos monitorados</p>
          <p className="text-2xl font-medium text-slate-900 mt-1">{rows.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Vencendo em até 60 dias</p>
          <p className="text-2xl font-medium text-rose-600 mt-1">{expiringCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-xs text-slate-500">Sem saldo</p>
          <p className="text-2xl font-medium text-rose-600 mt-1">{outOfBalanceCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-medium text-slate-800">Painel de acompanhamento</h2>
          </div>
          <span className="text-[11px] text-slate-500">Somente consulta</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-500 font-medium">
                <th className="py-3.5 px-4">Empresa</th>
                <th className="py-3.5 px-4">Nº do Contrato</th>
                <th className="py-3.5 px-4">Vencimento</th>
                <th className="py-3.5 px-4 text-right">Saldo</th>
                <th className="py-3.5 px-4">Aviso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    Nenhum contrato cadastrado para acompanhamento.
                  </td>
                </tr>
              ) : (
                rows.map(({ contract, balance, daysRemaining, isOutOfBalance }) => {
                  const isExpiring =
                    daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 60;
                  const isExpired = daysRemaining !== null && daysRemaining < 0;

                  return (
                    <tr key={contract.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-slate-900 font-medium max-w-sm">
                        <span className="block truncate" title={contract.creditor}>
                          {contract.creditor}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-mono">
                        {contract.contractNum}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="space-y-0.5">
                          <span>{formatBRDate(contract.endDate) || "-"}</span>
                          {isExpired && <p className="text-[11px] text-rose-600">Vencido</p>}
                          {isExpiring && (
                            <p className="text-[11px] text-rose-600">
                              Vence em {daysRemaining} dia(s)
                            </p>
                          )}
                        </div>
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-medium ${isOutOfBalance ? "text-rose-600" : "text-slate-800"}`}
                      >
                        {formatCurrency(balance)}
                      </td>
                      <td className="py-3.5 px-4">
                        {isOutOfBalance ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 text-[11px] text-rose-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Sem saldo disponível
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 text-[11px] text-rose-700">
                            Contrato vencido
                          </span>
                        ) : isExpiring ? (
                          <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2.5 py-1 text-[11px] text-rose-700">
                            Atenção ao vencimento
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">Em acompanhamento</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
