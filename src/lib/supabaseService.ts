import { supabase } from "./supabase";
import {
  Contract,
  Creditor,
  ServiceNote,
  FiscalPortaria,
  ContractAmendment,
  Commitment,
} from "../types";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: "Administrador" | "Fiscal" | "Gestor" | "Auditor";
  created_at?: string;
}

export const SUPABASE_SQL_SCHEMA = `-- SCHEMA COMPLETO PARA O SISTEMA NO SUPABASE
-- Acesse o SQL Editor do Supabase (https://supabase.com/dashboard/project/mbqjxajmnmeiuvcwzdhg/sql) e execute os comandos abaixo:

-- 1. Tabela de Perfil / Login de Usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Administrador',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Active RLS and policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura para usuários autenticados" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Permitir insercao de perfil proprio" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Permitir edicao de perfil proprio" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Tabela de Contratos (contracts)
CREATE TABLE IF NOT EXISTS public.contracts (
  id TEXT PRIMARY KEY,
  contract_num TEXT NOT NULL,
  creditor TEXT NOT NULL,
  object TEXT,
  start_date TEXT,
  end_date TEXT,
  total_value NUMERIC DEFAULT 0,
  used_value NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Ativo',
  category TEXT,
  fiscal_name TEXT,
  fiscal_portaria TEXT,
  fiscal_portaria_publication_date TEXT,
  fiscal_portaria_validity TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em contracts" ON public.contracts FOR ALL USING (true);

-- 3. Tabela de Credores (creditors)
CREATE TABLE IF NOT EXISTS public.creditors (
  id TEXT PRIMARY KEY,
  cnpj TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  active_contracts_count INT DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Ativo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.creditors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em creditors" ON public.creditors FOR ALL USING (true);

-- 4. Tabela de Notas Fiscais / Serviços (service_notes)
CREATE TABLE IF NOT EXISTS public.service_notes (
  id TEXT PRIMARY KEY,
  note_number TEXT NOT NULL,
  contract_num TEXT,
  creditor TEXT NOT NULL,
  issue_date TEXT,
  attestation_date TEXT,
  fiscal_name TEXT,
  value NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Pendente',
  budget_allocation TEXT,
  program TEXT,
  commitment_number TEXT,
  commitment_value NUMERIC DEFAULT 0,
  commitment_balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  commitment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS budget_allocation TEXT;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS attestation_date TEXT;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS fiscal_name TEXT;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS program TEXT;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS commitment_number TEXT;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS commitment_value NUMERIC DEFAULT 0;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS commitment_balance NUMERIC DEFAULT 0;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS current_balance NUMERIC DEFAULT 0;
ALTER TABLE public.service_notes ADD COLUMN IF NOT EXISTS commitment_id TEXT;

ALTER TABLE public.service_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em service_notes" ON public.service_notes FOR ALL USING (true);

-- 4.1. Tabela de Empenhos (commitments)
CREATE TABLE IF NOT EXISTS public.commitments (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  budget_allocation TEXT NOT NULL,
  program TEXT NOT NULL,
  value NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  current_balance NUMERIC DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em commitments" ON public.commitments FOR ALL USING (true);

-- 5. Tabela de Fiscais e Portarias (fiscais)
CREATE TABLE IF NOT EXISTS public.fiscais (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  portaria TEXT NOT NULL,
  publication_date TEXT,
  validity TEXT,
  organ TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em fiscais" ON public.fiscais FOR ALL USING (true);

-- 6. Tabela de Aditivos Contratuais (contract_amendments)
CREATE TABLE IF NOT EXISTS public.contract_amendments (
  id TEXT PRIMARY KEY,
  amendment_num TEXT NOT NULL,
  contract_num TEXT NOT NULL,
  creditor TEXT NOT NULL,
  type TEXT NOT NULL,
  value_change NUMERIC DEFAULT 0,
  new_end_date TEXT,
  signature_date TEXT,
  publication_date TEXT,
  justification TEXT,
  status TEXT DEFAULT 'Vigente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.contract_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir tudo em contract_amendments" ON public.contract_amendments FOR ALL USING (true);
`;

// Supabase sync helpers
export async function fetchContractsFromSupabase(): Promise<Contract[] | null> {
  try {
    const { data, error } = await supabase.from("contracts").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      contractNum: item.contract_num,
      creditor: item.creditor,
      object: item.object || "",
      startDate: item.start_date || "",
      endDate: item.end_date || "",
      totalValue: Number(item.total_value || 0),
      usedValue: Number(item.used_value || 0),
      status: item.status || "Ativo",
      category: item.category || "Geral",
      fiscalName: item.fiscal_name || "",
      fiscalPortaria: item.fiscal_portaria || "",
      fiscalPortariaPublicationDate: item.fiscal_portaria_publication_date || "",
      fiscalPortariaValidity: item.fiscal_portaria_validity || "",
      items: Array.isArray(item.items) ? item.items : [],
    }));
  } catch (err) {
    console.error("Erro ao buscar contratos no Supabase:", err);
    return null;
  }
}

export async function saveContractToSupabase(contract: Contract) {
  try {
    await supabase.from("contracts").upsert({
      id: contract.id,
      contract_num: contract.contractNum,
      creditor: contract.creditor,
      object: contract.object,
      start_date: contract.startDate,
      end_date: contract.endDate,
      total_value: contract.totalValue,
      used_value: contract.usedValue || 0,
      status: contract.status,
      category: contract.category,
      fiscal_name: contract.fiscalName,
      fiscal_portaria: contract.fiscalPortaria,
      fiscal_portaria_publication_date: contract.fiscalPortariaPublicationDate,
      fiscal_portaria_validity: contract.fiscalPortariaValidity,
      items: contract.items || [],
    });
  } catch (err) {
    console.error("Erro ao salvar contrato no Supabase:", err);
  }
}

export async function deleteContractFromSupabase(id: string) {
  try {
    await supabase.from("contracts").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar contrato no Supabase:", err);
  }
}

export async function fetchCreditorsFromSupabase(): Promise<Creditor[] | null> {
  try {
    const { data, error } = await supabase.from("creditors").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      cnpj: item.cnpj,
      name: item.name,
      category: item.category || "Geral",
      activeContractsCount: item.active_contracts_count || 0,
      totalValue: Number(item.total_value || 0),
      status: item.status || "Ativo",
    }));
  } catch (err) {
    console.error("Erro ao buscar credores no Supabase:", err);
    return null;
  }
}

export async function saveCreditorToSupabase(creditor: Creditor) {
  try {
    await supabase.from("creditors").upsert({
      id: creditor.id,
      cnpj: creditor.cnpj,
      name: creditor.name,
      category: creditor.category,
      active_contracts_count: creditor.activeContractsCount,
      total_value: creditor.totalValue,
      status: creditor.status,
    });
  } catch (err) {
    console.error("Erro ao salvar credor no Supabase:", err);
  }
}

export async function deleteCreditorFromSupabase(id: string) {
  try {
    await supabase.from("creditors").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar credor no Supabase:", err);
  }
}

export async function fetchNotesFromSupabase(): Promise<ServiceNote[] | null> {
  try {
    const { data, error } = await supabase.from("service_notes").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      noteNumber: item.note_number,
      contractNum: item.contract_num || "",
      creditor: item.creditor || "",
      issueDate: item.issue_date || "",
      attestationDate: item.attestation_date || "",
      fiscalName: item.fiscal_name || "",
      value: Number(item.value || 0),
      status: item.status || "Pendente",
      budgetAllocation: item.budget_allocation || "",
      program: item.program || "",
      commitmentNumber: item.commitment_number || "",
      commitmentValue: Number(item.commitment_value || 0),
      commitmentBalance: Number(item.commitment_balance || 0),
      currentBalance: Number(item.current_balance || 0),
      commitmentId: item.commitment_id || "",
    }));
  } catch (err) {
    console.error("Erro ao buscar notas no Supabase:", err);
    return null;
  }
}

export async function saveNoteToSupabase(note: ServiceNote) {
  try {
    await supabase.from("service_notes").upsert({
      id: note.id,
      note_number: note.noteNumber,
      contract_num: note.contractNum,
      creditor: note.creditor,
      issue_date: note.issueDate,
      attestation_date: note.attestationDate || "",
      fiscal_name: note.fiscalName || "",
      value: note.value,
      status: note.status,
      budget_allocation: note.budgetAllocation,
      program: note.program,
      commitment_number: note.commitmentNumber,
      commitment_value: note.commitmentValue || 0,
      commitment_balance: note.commitmentBalance || 0,
      current_balance: note.currentBalance || 0,
      commitment_id: note.commitmentId,
    });
  } catch (err) {
    console.error("Erro ao salvar nota no Supabase:", err);
  }
}

export async function deleteNoteFromSupabase(id: string) {
  try {
    await supabase.from("service_notes").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar nota no Supabase:", err);
  }
}

export async function fetchCommitmentsFromSupabase(): Promise<Commitment[] | null> {
  try {
    const { data, error } = await supabase.from("commitments").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      number: item.number,
      budgetAllocation: item.budget_allocation || "",
      program: item.program || "",
      value: Number(item.value || 0),
      balance: Number(item.balance || 0),
      currentBalance: Number(item.current_balance || 0),
      description: item.description || "",
      createdAt: item.created_at || "",
    }));
  } catch (err) {
    console.error("Erro ao buscar empenhos no Supabase:", err);
    return null;
  }
}

export async function saveCommitmentToSupabase(commitment: Commitment) {
  try {
    const { error } = await supabase.from("commitments").upsert({
      id: commitment.id,
      number: commitment.number,
      budget_allocation: commitment.budgetAllocation,
      program: commitment.program,
      value: commitment.value,
      balance: commitment.balance,
      current_balance: commitment.currentBalance,
      description: commitment.description,
    });
    if (error) throw error;
  } catch (err) {
    console.error("Erro ao salvar empenho no Supabase:", err);
  }
}

export async function deleteCommitmentFromSupabase(id: string) {
  try {
    await supabase.from("commitments").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar empenho no Supabase:", err);
  }
}

export async function fetchFiscaisFromSupabase(): Promise<FiscalPortaria[] | null> {
  try {
    const { data, error } = await supabase.from("fiscais").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      portaria: item.portaria,
      publicationDate: item.publication_date || "",
      validity: item.validity || "",
      organ: item.organ || "",
    }));
  } catch (err) {
    console.error("Erro ao buscar fiscais no Supabase:", err);
    return null;
  }
}

export async function saveFiscalToSupabase(fiscal: FiscalPortaria) {
  try {
    const { error } = await supabase.from("fiscais").upsert({
      id: fiscal.id,
      name: fiscal.name,
      portaria: fiscal.portaria,
      publication_date: fiscal.publicationDate,
      validity: fiscal.validity,
      organ: fiscal.organ,
    });
    if (error) throw error;
  } catch (err) {
    console.error("Erro ao salvar fiscal no Supabase:", err);
  }
}

export async function deleteFiscalFromSupabase(id: string) {
  try {
    await supabase.from("fiscais").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar fiscal no Supabase:", err);
  }
}

export async function fetchAmendmentsFromSupabase(): Promise<ContractAmendment[] | null> {
  try {
    const { data, error } = await supabase.from("contract_amendments").select("*");
    if (error || !data) return null;
    return data.map((item) => ({
      id: item.id,
      amendmentNum: item.amendment_num,
      contractNum: item.contract_num,
      creditor: item.creditor,
      type: item.type as any,
      valueChange: item.value_change ? Number(item.value_change) : undefined,
      newEndDate: item.new_end_date || undefined,
      signatureDate: item.signature_date || "",
      publicationDate: item.publication_date || "",
      justification: item.justification || "",
      status: item.status || "Vigente",
    }));
  } catch (err) {
    console.error("Erro ao buscar aditivos no Supabase:", err);
    return null;
  }
}

export async function saveAmendmentToSupabase(amendment: ContractAmendment) {
  try {
    await supabase.from("contract_amendments").upsert({
      id: amendment.id,
      amendment_num: amendment.amendmentNum,
      contract_num: amendment.contractNum,
      creditor: amendment.creditor,
      type: amendment.type,
      value_change: amendment.valueChange || 0,
      new_end_date: amendment.newEndDate,
      signature_date: amendment.signatureDate,
      publication_date: amendment.publicationDate,
      justification: amendment.justification,
      status: amendment.status,
    });
  } catch (err) {
    console.error("Erro ao salvar aditivo no Supabase:", err);
  }
}

export async function deleteAmendmentFromSupabase(id: string) {
  try {
    await supabase.from("contract_amendments").delete().eq("id", id);
  } catch (err) {
    console.error("Erro ao deletar aditivo no Supabase:", err);
  }
}
