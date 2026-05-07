import { supabase } from "@/integrations/supabase/client";
import type { RequestPdfData, RequestPdfItem } from "@/lib/request-pdf";

export interface RequisicaoPdfRow {
  id: string;
  saida_codigo: string | null;
  categoria: string | null;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  solicitante_funcao: string | null;
  data: string | null;
  created_at: string;
  status: string;
  items: RequestPdfItem[] | null;
}

export async function resolveRequestForPdf(request: RequisicaoPdfRow, code: string): Promise<RequestPdfData> {
  let programa = request.setor || "-";
  let requesterDisplayName = request.solicitante || "-";
  let requesterDisplayCpf = request.solicitante_cpf || "-";
  let requesterDisplayRole = request.solicitante_funcao || "Solicitante do setor";

  const sectorName = request.setor?.trim();
  if (sectorName) {
    const { data: setorData } = await supabase
      .from("setores")
      .select("programa")
      .eq("nome", sectorName)
      .maybeSingle();

    if (setorData?.programa) {
      programa = setorData.programa;
    }
  }

  if (request.solicitante_cpf) {
    const { data: profile } = await supabase
      .from("usuarios")
      .select("nome,cpf,funcao,setor")
      .eq("cpf", request.solicitante_cpf)
      .maybeSingle();

    if (profile?.nome) requesterDisplayName = profile.nome;
    if (profile?.cpf) requesterDisplayCpf = profile.cpf;
    if (profile?.funcao) requesterDisplayRole = profile.funcao;
    if (!sectorName && profile?.setor) programa = profile.setor;
  }

  return {
    ...request,
    saida_codigo: code,
    programa,
    requesterDisplayName,
    requesterDisplayCpf,
    requesterDisplayRole,
  };
}
