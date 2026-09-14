import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  PieChart as PieIcon,
  BarChart2,
  ArrowRight,
  ShieldAlert,
  FileCheck2,
  Printer,
  PlusCircle,
  Receipt,
  Layers,
  Filter,
  CheckCircle2,
} from "lucide-react";
import { Contract, ServiceNote } from "../types";
import { formatBRDate, parseBRDate } from "../utils/dateFormat";

interface DashboardChartsProps {
  contracts: Contract[];
  notes: ServiceNote[];
  onNavigateTab: (tab: any) => void;
  onPrintContract: (contract: Contract) => void;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({
  contracts,
  notes,
  onNavigateTab,
  onPrintContract,
}) => {
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [activeChartView, setActiveChartView] = useState<"finance" | "status" | "evolution">(
    "finance",
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const getDaysUntil = (dateStr: string): number | null => {
    const target = parseBRDate(dateStr);
    if (!target) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // 1. Group contracts by Category / Órgão
  const categoriesMap: {
    [key: string]: { total: number; used: number; remaining: number; count: number };
  } = {};

  contracts.forEach((c) => {
    const cat = c.category || "Outros / Não Especificado";
    const notesSum = notes
      ? notes.filter((n) => n.contractNum === c.contractNum).reduce((sum, n) => sum + n.value, 0)
      : 0;
    const used = Math.max(c.usedValue || 0, notesSum);
    const remaining = Math.max(0, c.totalValue - used);

    if (!categoriesMap[cat]) {
      categoriesMap[cat] = { total: 0, used: 0, remaining: 0, count: 0 };
    }
    categoriesMap[cat].total += c.totalValue;
    categoriesMap[cat].used += used;
    categoriesMap[cat].remaining += remaining;
    categoriesMap[cat].count += 1;
  });

  const categoryChartData = Object.keys(categoriesMap).map((catKey) => {
    const shortName = catKey
      .replace("Secretaria de ", "Sec. ")
      .replace("Fundo Municipal de ", "Fundo ");
    return {
      fullName: catKey,
      name: shortName.length > 18 ? shortName.substring(0, 18) + "..." : shortName,
      "Valor Contratado": categoriesMap[catKey].total,
      "Valor Consumido": categoriesMap[catKey].used,
      "Saldo Disponível": categoriesMap[catKey].remaining,
      count: categoriesMap[catKey].count,
    };
  });

  // 2. Status distribution data
  const statusCounts = {
    Ativo: contracts.filter((c) => c.status === "Ativo").length,
    "A Vencer": contracts.filter((c) => c.status === "A Vencer").length,
    Encerrado: contracts.filter((c) => c.status === "Encerrado").length,
    Suspenso: contracts.filter((c) => c.status === "Suspenso").length,
  };

  const pieData = [
    { name: "Contratos Ativos", value: statusCounts.Ativo, color: "#10b981" }, // emerald-500
    { name: "Contratos a Vencer", value: statusCounts["A Vencer"], color: "#f59e0b" }, // amber-500
    { name: "Encerrados", value: statusCounts.Encerrado, color: "#64748b" }, // slate-500
    { name: "Suspensos", value: statusCounts.Suspenso, color: "#f43f5e" }, // rose-500
  ].filter((item) => item.value > 0);

  // 3. Notes Evolution Data (Liquidação)
  const notesEvolutionData = notes.map((n, idx) => ({
    name: `Nota #${n.noteNumber}`,
    date: n.issueDate,
    valor: n.value,
    acumulado: notes.slice(0, idx + 1).reduce((acc, curr) => acc + curr.value, 0),
  }));

  // Determine default month: August (8), if none in August check September (9), else 8
  const hasAugust = contracts.some((c) => {
    const d = parseBRDate(c.endDate);
    const days = getDaysUntil(c.endDate);
    const isExp = c.status === "A Vencer" || (days !== null && days <= 90);
    return isExp && d && d.getMonth() + 1 === 8;
  });

  const hasSeptember = contracts.some((c) => {
    const d = parseBRDate(c.endDate);
    const days = getDaysUntil(c.endDate);
    const isExp = c.status === "A Vencer" || (days !== null && days <= 90);
    return isExp && d && d.getMonth() + 1 === 9;
  });

  const defaultExpiringMonth = hasAugust ? 8 : hasSeptember ? 9 : 8;
  const [selectedExpiringMonth, setSelectedExpiringMonth] = useState<number | "all">(
    defaultExpiringMonth,
  );

  // Filter Expiring Contracts for Alert Banner & Control Section
  const allExpiringContracts = contracts.filter((c) => {
    const days = getDaysUntil(c.endDate);
    return c.status === "A Vencer" || (days !== null && days <= 90);
  });

  const expiringContracts = allExpiringContracts.filter((c) => {
    if (selectedExpiringMonth === "all") return true;
    const d = parseBRDate(c.endDate);
    return d && d.getMonth() + 1 === selectedExpiringMonth;
  });

  // Calculate totals for summary badges
  const totalPactuado = contracts.reduce((acc, c) => acc + c.totalValue, 0);
  const totalUsado = contracts.reduce((acc, c) => {
    const notesSum = notes
      ? notes.filter((n) => n.contractNum === c.contractNum).reduce((sum, n) => sum + n.value, 0)
      : 0;
    return acc + Math.max(c.usedValue || 0, notesSum);
  }, 0);
  const totalSaldoRestante = Math.max(0, totalPactuado - totalUsado);
  const percentualGlobalUsado =
    totalPactuado > 0 ? Math.round((totalUsado / totalPactuado) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 🚨 BANNER DE ALERTA DE VENCIMENTO DE CONTRATO E DATAS DE CONTROLE */}
      {allExpiringContracts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border border-amber-300/80 rounded-2xl p-5 shadow-2xs relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center space-x-2 flex-wrap gap-2">
                  <h3 className="text-sm font-medium text-amber-950 uppercase tracking-wide">
                    Alerta de Vencimento de Contratos ({expiringContracts.length} de{" "}
                    {allExpiringContracts.length})
                  </h3>
                  <span className="px-2 py-0.5 bg-amber-200/90 text-amber-900 text-[10px] font-medium rounded-full uppercase">
                    Controle de Vigência
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed max-w-3xl">
                  Visualize os números e as datas de vencimento de cada contrato. Filtre por mês
                  (padrão Agosto / Setembro) para planejar aditivos de prorrogação.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
              {/* Month Filter Selector */}
              <div className="flex items-center space-x-1.5 bg-white border border-amber-300/80 rounded-xl px-3 py-1.5 shadow-2xs">
                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                <span className="text-[11px] font-medium text-amber-900">Mês:</span>
                <select
                  value={selectedExpiringMonth}
                  onChange={(e) =>
                    setSelectedExpiringMonth(
                      e.target.value === "all" ? "all" : Number(e.target.value),
                    )
                  }
                  className="bg-transparent text-amber-950 text-xs font-medium outline-none cursor-pointer"
                >
                  <option value="all">Todos os Meses</option>
                  <option value={1}>Janeiro</option>
                  <option value={2}>Fevereiro</option>
                  <option value={3}>Março</option>
                  <option value={4}>Abril</option>
                  <option value={5}>Maio</option>
                  <option value={6}>Junho</option>
                  <option value={7}>Julho</option>
                  <option value={8}>Agosto</option>
                  <option value={9}>Setembro</option>
                  <option value={10}>Outubro</option>
                  <option value={11}>Novembro</option>
                  <option value={12}>Dezembro</option>
                </select>
              </div>

              <button
                onClick={() => onNavigateTab("aditivos")}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Prorrogar via Aditivo</span>
              </button>
            </div>
          </div>

          {/* Cards Rápidos de Contratos em Alerta */}
          {expiringContracts.length === 0 ? (
            <div className="mt-4 pt-4 border-t border-amber-200/60 text-center py-6 text-amber-900/70 text-xs italic">
              Nenhum contrato a vencer no mês selecionado. (Experimente selecionar "Todos os Meses"
              ou outro mês no filtro acima).
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-4 border-t border-amber-200/60">
              {expiringContracts.map((c) => {
                const days = getDaysUntil(c.endDate);
                const notesSum = notes
                  ? notes
                      .filter((n) => n.contractNum === c.contractNum)
                      .reduce((sum, n) => sum + n.value, 0)
                  : 0;
                const used = Math.max(c.usedValue || 0, notesSum);
                const remaining = Math.max(0, c.totalValue - used);

                return (
                  <div
                    key={c.id}
                    className="bg-white/95 backdrop-blur-xs border border-amber-200/90 rounded-xl p-3.5 space-y-2.5 shadow-2xs hover:shadow-xs transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-medium text-slate-900 block font-mono bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                          Nº {c.contractNum}
                        </span>
                        <span
                          className="text-[11px] font-medium text-slate-600 block truncate max-w-[190px] mt-1"
                          title={c.creditor}
                        >
                          {c.creditor}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                          days !== null && days <= 30
                            ? "bg-rose-100 text-rose-800 border-rose-200"
                            : "bg-amber-100 text-amber-800 border-amber-200"
                        }`}
                      >
                        {days !== null ? (days < 0 ? "Vencido" : `${days} dias`) : c.status}
                      </span>
                    </div>

                    {/* Datas de Controle de Vigência Detalhas */}
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400 font-medium uppercase block text-[9px]">
                          Início Vigência
                        </span>
                        <span className="text-slate-800 font-medium">
                          {formatBRDate(c.startDate)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-rose-600 font-medium uppercase block text-[9px]">
                          Data de Vencimento
                        </span>
                        <span className="text-rose-700 font-medium text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-100 inline-block">
                          {formatBRDate(c.endDate)}
                        </span>
                      </div>
                    </div>

                    {/* Saldo e Utilização */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-medium">
                        <span className="text-slate-500">Saldo Restante:</span>
                        <span className="text-emerald-700">{formatCurrency(remaining)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round((used / (c.totalValue || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Ações Rápidas do Card de Alerta */}
                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <button
                        onClick={() => onPrintContract(c)}
                        className="text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        <Printer className="w-3 h-3 text-slate-500" />
                        <span>Ficha PDF</span>
                      </button>
                      <button
                        onClick={() => onNavigateTab("aditivos")}
                        className="text-amber-700 hover:text-amber-900 font-medium flex items-center space-x-1 cursor-pointer"
                      >
                        <span>Aditivar</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 📊 PAINEL DE GRÁFICOS GERENCIAIS DE EXECUÇÃO E SALDOS */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 md:p-6 space-y-5">
        {/* Top Header dos Gráficos */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-medium text-slate-900 flex items-center space-x-2">
              <BarChart2 className="w-5 h-5 text-emerald-600" />
              <span>Painel de Análise de Saldos e Execução Financeira</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Acompanhamento gráfico interativo de valores contratados, saldos disponíveis por órgão
              e distribuição de vigências.
            </p>
          </div>

          {/* Chart Tabs selector */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl space-x-1 self-start sm:self-auto text-xs font-medium">
            <button
              onClick={() => setActiveChartView("finance")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeChartView === "finance"
                  ? "bg-white text-slate-900 shadow-2xs font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Execução por Órgão
            </button>
            <button
              onClick={() => setActiveChartView("status")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeChartView === "status"
                  ? "bg-white text-slate-900 shadow-2xs font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Status & Vigência
            </button>
            <button
              onClick={() => setActiveChartView("evolution")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeChartView === "evolution"
                  ? "bg-white text-slate-900 shadow-2xs font-medium"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Evolução de Notas
            </button>
          </div>
        </div>

        {/* Totais do Topo do Gráfico */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/70 text-xs">
          <div>
            <span className="text-[10px] uppercase font-medium text-slate-400 block">
              Total Pactuado Global
            </span>
            <span className="font-medium text-slate-900 text-sm mt-0.5 block">
              {formatCurrency(totalPactuado)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-medium text-slate-400 block">
              Valor Consumido (Notas)
            </span>
            <span className="font-medium text-rose-700 text-sm mt-0.5 block">
              {formatCurrency(totalUsado)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-medium text-slate-400 block">
              Saldo Líquido Restante
            </span>
            <span className="font-medium text-emerald-700 text-sm mt-0.5 block">
              {formatCurrency(totalSaldoRestante)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-medium text-slate-400 block">
              % Executado Global
            </span>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="font-medium text-slate-800 text-sm">{percentualGlobalUsado}%</span>
              <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[80px]">
                <div
                  className="bg-emerald-600 h-2 rounded-full"
                  style={{ width: `${percentualGlobalUsado}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CONTAINER DOS GRÁFICOS */}
        <div className="w-full h-[320px] pt-2">
          {activeChartView === "finance" && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryChartData}
                margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 600 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), ""]}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#cbd5e1",
                    borderRadius: "12px",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: "11px", fontWeight: 600, paddingBottom: "10px" }}
                />
                <Bar dataKey="Valor Contratado" fill="#0284c7" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="Valor Consumido" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="Saldo Disponível" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartView === "status" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${val} contratos`, "Quantidade"]}
                    contentStyle={{ borderRadius: "10px", fontSize: "12px" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: "11px", fontWeight: 600 }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 text-xs">
                <h4 className="font-medium text-slate-800 uppercase text-[11px] tracking-wider border-b border-slate-200 pb-2">
                  Detalhamento de Vigência e Situação
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center space-x-1.5 font-medium text-emerald-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span>Contratos Ativos e Regulares:</span>
                    </span>
                    <span className="font-medium text-slate-900">{statusCounts.Ativo}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center space-x-1.5 font-medium text-amber-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span>Contratos a Vencer (&le; 90 dias):</span>
                    </span>
                    <span className="font-medium text-amber-900">{statusCounts["A Vencer"]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center space-x-1.5 font-medium text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                      <span>Contratos Encerrados / Finalizados:</span>
                    </span>
                    <span className="font-medium text-slate-800">{statusCounts.Encerrado}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Mantenha a vigência atualizada lançando <strong>Termos Aditivos</strong> na aba
                    correspondente para evitar interrupções de serviço.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeChartView === "evolution" && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={notesEvolutionData}
                margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
              >
                <defs>
                  <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), "Acumulado Liquidados"]}
                  contentStyle={{ borderRadius: "12px", fontSize: "12px" }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ fontSize: "11px", fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="acumulado"
                  name="Total Consumido em Notas"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorAcumulado)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
};
