import React, { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Calendar,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";
import { ActiveTab, Contract, ContractAmendment, ServiceNote } from "../types";
import pereiroLogoUrl from "../../assets/templates/notification-image3.png";
import templateDocUrl from "../../assets/MODELO PADRAO DE NOTIFICACAO-editavel.docx?url";

interface AlertsViewProps {
  contracts: Contract[];
  notes: ServiceNote[];
  amendments: ContractAmendment[];
  onNavigateTab: (tab: ActiveTab) => void;
  onPrintContract?: (contract: Contract) => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  contracts,
  notes,
  amendments,
  onNavigateTab,
}) => {
  const alertItems = useMemo(() => {
    const contractAlerts = contracts
      .filter((contract) => contract.status === "A Vencer")
      .slice(0, 5)
      .map((contract) => ({
        id: `contract-${contract.id}`,
        label: `Contrato ${contract.contractNum}`,
        text: `${contract.creditor} vence em ${contract.endDate}`,
        tab: "aditivos" as ActiveTab,
      }));

    const noteAlerts = notes
      .filter((note) => note.status === "Pendente")
      .slice(0, 5)
      .map((note) => ({
        id: `note-${note.id}`,
        label: `Nota ${note.noteNumber}`,
        text: `${note.creditor} - ${note.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        tab: "notas" as ActiveTab,
      }));

    const amendmentAlerts = amendments
      .filter((amendment) => amendment.status === "Em Análise")
      .slice(0, 5)
      .map((amendment) => ({
        id: `amendment-${amendment.id}`,
        label: amendment.amendmentNum,
        text: `${amendment.contractNum} em análise`,
        tab: "aditivos" as ActiveTab,
      }));

    return [...contractAlerts, ...noteAlerts, ...amendmentAlerts];
  }, [contracts, notes, amendments]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-slate-900">
                Modelo Word original editável
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Baixe o documento exatamente como enviado, preservando formatação, layout, logo e
                marcações amarelas.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={templateDocUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir</span>
            </a>
            <a
              href={templateDocUrl}
              download="MODELO PADRAO DE NOTIFICACAO-editavel.docx"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar .DOCX</span>
            </a>
          </div>
        </div>

        <div className="bg-slate-100 p-5">
          <div className="bg-white border border-slate-200 shadow-xl rounded-xl max-w-4xl mx-auto min-h-[620px] p-8 flex flex-col">
            <div className="border-b border-slate-200 pb-5">
              <img
                src={pereiroLogoUrl}
                alt="Prefeitura Municipal de Pereiro"
                className="max-h-24 object-contain"
              />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">Use o arquivo Word original</h3>
              <p className="text-sm text-slate-500 max-w-xl mt-2 leading-relaxed">
                A edição fiel do modelo deve ser feita no próprio Word, porque o navegador não
                preserva 100% da formatação de arquivos .docx complexos. O botão abaixo baixa o
                documento editável original com o mesmo layout.
              </p>
              <a
                href={templateDocUrl}
                download="MODELO PADRAO DE NOTIFICACAO-editavel.docx"
                className="mt-6 inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Baixar modelo editável</span>
              </a>
            </div>

            <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-900">
              Os textos destacados em amarelo já estão no modelo original. Abra o arquivo no Word
              para editar mantendo fonte, espaçamento, logo e layout.
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-3">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-slate-800">Pendências</span>
            </div>
            <span className="text-[11px] font-medium text-slate-500">{alertItems.length}</span>
          </div>

          {alertItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              <Calendar className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              Nenhuma pendência encontrada.
            </div>
          ) : (
            <div className="space-y-2">
              {alertItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigateTab(item.tab)}
                  className="w-full text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-800 truncate">{item.label}</p>
                      <p className="text-[11px] text-slate-500 line-clamp-2">{item.text}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
