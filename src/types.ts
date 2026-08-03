export type ContractStatus = "Ativo" | "A Vencer" | "Encerrado" | "Suspenso";

export interface Contract {
  id: string;
  contractNum: string;
  creditor: string;
  object: string;
  startDate: string;
  endDate: string;
  totalValue: number;
  usedValue?: number;
  status: ContractStatus;
  category?: string;
  fiscalName?: string;
  fiscalPortaria?: string;
  fiscalPortariaPublicationDate?: string;
  fiscalPortariaValidity?: string;
  items?: ContractItem[];
}

export interface ContractItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
}

export interface ActivityItem {
  id: string;
  type: "contract" | "creditor" | "invoice" | "alert" | "additive" | "report";
  title: string;
  time: string;
  iconColor: "green" | "blue" | "purple" | "amber" | "teal";
}

export interface Creditor {
  id: string;
  cnpj: string;
  name: string;
  category: string;
  activeContractsCount: number;
  totalValue: number;
  status: "Ativo" | "Inativo";
}

export interface ServiceNote {
  id: string;
  noteNumber: string;
  contractNum: string;
  creditor: string;
  issueDate: string;
  attestationDate?: string;
  fiscalName?: string;
  value: number;
  status: "Emitida" | "Paga" | "Pendente" | "Concluido";
  budgetAllocation?: "06.01" | "06.06" | string;
  program?: string;
  commitmentNumber?: string;
  commitmentValue?: number;
  commitmentBalance?: number;
  currentBalance?: number;
  commitmentId?: string;
}

export interface Commitment {
  id: string;
  number: string;
  budgetAllocation: "06.01" | "06.06" | string;
  program: string;
  value: number;
  balance: number;
  currentBalance: number;
  description?: string;
  createdAt?: string;
}

export interface FiscalPortaria {
  id: string;
  name: string;
  portaria: string;
  publicationDate: string;
  validity: string;
  organ: "Secretaria de Saúde" | "Fundo Municipal de Saúde" | string;
}

export interface ContractAmendment {
  id: string;
  amendmentNum: string;
  contractNum: string;
  creditor: string;
  type:
    | "Prorrogação Contratual"
    | "Realinhamento"
    | "Aditivo por Rescisão"
    | "Aditivo de Redução de Valor"
    | "Acréscimo de Valor"
    | "Aditivo por Diversas Alterações"
    | "Prorrogação de Prazo"
    | "Redução de Valor"
    | "Reajuste / Repactuação"
    | "Alteração Qualitativa"
    | "Outros";
  valueChange: number;
  newEndDate?: string;
  signatureDate: string;
  publicationDate?: string;
  justification: string;
  status: "Vigente" | "Registrado" | "Em Análise";
}

export type ActiveTab =
  | "dashboard"
  | "contratos-lancados"
  | "controle-contratos"
  | "lancar-contrato"
  | "fiscais"
  | "credores"
  | "empenhos"
  | "notas"
  | "aditivos"
  | "relatorios"
  | "alertas"
  | "ia";

export interface SystemNotification {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "contract" | "note" | "amendment" | "fiscal" | "info";
  read: boolean;
  linkTab?: ActiveTab;
}
