import React from "react";
import { ShieldCheck, Lock, CheckCircle2, X } from "lucide-react";

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-medium text-slate-800">Ambiente Seguro & Protegido</h3>
            <p className="text-[11px] text-slate-500">
              Informações de auditoria e segurança dos dados
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          O sistema SIGEC emprega padrões rigorosos de segurança cibernética e auditoria fiscal
          contínua.
        </p>

        <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-start space-x-3">
            <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-medium text-slate-800">Criptografia Ponta a Ponta</h5>
              <p className="text-[11px] text-slate-400">
                AES-256 bits para armazenamento de dados e relatórios contratuais.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-medium text-slate-800">Conformidade LGPD & Fiscal</h5>
              <p className="text-[11px] text-slate-400">
                Trilhas de auditoria imutáveis para prestação de contas de órgãos reguladores.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
