import { createFileRoute } from "@tanstack/react-router";
import { FileText, Loader2, Printer, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveCanonicalLocationNameFromCandidates,
  type LocationOption,
} from "@/lib/location-normalizer";
import type { RequestPdfItem } from "@/lib/request-pdf";

export const Route = createFileRoute("/admin/controle-entradas")({
  component: ControleEntradasPage,
});

type RequestRow = {
  id: string;
  saida_codigo: string | null;
  categoria: string | null;
  data: string | null;
  created_at: string;
  setor: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
  items: RequestPdfItem[] | null;
};

type UserLocation = {
  cpf: string | null;
  setor: string | null;
  unidade_nome: string | null;
};

type ReportRow = RequestRow & {
  local: string;
  pedido: string;
};

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "Mes selecionado";

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function getMonthRange(value: string) {
  const [year, month] = value.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function formatCreatedDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getItemName(item: RequestPdfItem) {
  return String(item.item || item.nome || item.description || "").trim();
}

function buildPedido(items: RequestPdfItem[] | null) {
  const names = (items ?? []).map(getItemName).filter(Boolean);
  if (!names.length) return "-";
  if (names.length <= 4) return names.join("; ");

  return `${names.slice(0, 4).join("; ")} +${names.length - 4}`;
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function ControleEntradasPage() {
  const [month, setMonth] = useState(getCurrentMonthValue());
  const [selectedLocal, setSelectedLocal] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [usersByCpf, setUsersByCpf] = useState<Map<string, UserLocation>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      setGenerated(false);

      try {
        const { start, end } = getMonthRange(month);
        const [requestsResult, locationsResult] = await Promise.all([
          supabase
            .from("requisicoes")
            .select("id,saida_codigo,categoria,data,created_at,setor,solicitante,solicitante_cpf,items")
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true }),
          supabase.from("setores").select("nome,programa").order("nome", { ascending: true }),
        ]);

        if (!active) return;

        if (requestsResult.error || locationsResult.error) {
          throw new Error(
            requestsResult.error?.message ||
              locationsResult.error?.message ||
              "Erro ao carregar dados.",
          );
        }

        const loadedRequests = (requestsResult.data ?? []) as RequestRow[];
        const loadedLocations = (locationsResult.data ?? []) as LocationOption[];
        const cpfs = Array.from(
          new Set(
            loadedRequests
              .map((request) => request.solicitante_cpf?.trim())
              .filter((cpf): cpf is string => Boolean(cpf)),
          ),
        );
        const nextUsersByCpf = new Map<string, UserLocation>();

        if (cpfs.length > 0) {
          const { data: users, error: usersError } = await supabase
            .from("usuarios")
            .select("cpf,setor,unidade_nome")
            .in("cpf", cpfs);

          if (usersError) throw new Error(usersError.message);

          ((users ?? []) as UserLocation[]).forEach((user) => {
            if (user.cpf) nextUsersByCpf.set(user.cpf, user);
          });
        }

        if (!active) return;

        setLocations(loadedLocations);
        setRequests(loadedRequests);
        setUsersByCpf(nextUsersByCpf);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [month]);

  const reportRows = useMemo<ReportRow[]>(() => {
    return requests
      .map((request) => {
        const profile = usersByCpf.get(request.solicitante_cpf?.trim() || "");
        const local = resolveCanonicalLocationNameFromCandidates(
          [request.setor, profile?.unidade_nome, profile?.setor],
          locations,
          "Sem local",
        );

        return {
          ...request,
          local,
          pedido: buildPedido(request.items),
        };
      })
      .filter((request) => !selectedLocal || request.local === selectedLocal)
      .sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        return leftTime - rightTime || (left.saida_codigo || "").localeCompare(right.saida_codigo || "");
      });
  }, [locations, requests, selectedLocal, usersByCpf]);

  const availableLocals = useMemo(() => {
    const locals = new Set<string>();

    requests.forEach((request) => {
      const profile = usersByCpf.get(request.solicitante_cpf?.trim() || "");
      locals.add(
        resolveCanonicalLocationNameFromCandidates(
          [request.setor, profile?.unidade_nome, profile?.setor],
          locations,
          "Sem local",
        ),
      );
    });

    return Array.from(locals).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [locations, requests, usersByCpf]);

  useEffect(() => {
    if (selectedLocal && !availableLocals.includes(selectedLocal)) {
      setSelectedLocal("");
      setGenerated(false);
    }
  }, [availableLocals, selectedLocal]);

  const handleGenerate = () => {
    setGenerating(true);
    setGenerated(true);
    window.setTimeout(() => setGenerating(false), 150);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCsv = () => {
    const header = ["Data", "Número", "Tipo de material", "Solicitante", "Pedido"];
    const rows = reportRows.map((request) => [
      formatCreatedDate(request.created_at),
      request.saida_codigo || request.id,
      request.categoria || "-",
      request.solicitante || "-",
      request.pedido,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `controle-entradas-${selectedLocal || "todos"}-${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <p className="text-sm text-muted-foreground">Início / Controle de Entradas</p>
        <h2 className="text-2xl text-foreground">Controle de Entradas</h2>
      </div>

      <Card className="p-4 print:hidden">
        <div className="grid gap-4 lg:grid-cols-[180px_minmax(220px,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="month">Mês</Label>
            <Input
              id="month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value || getCurrentMonthValue())}
            />
          </div>

          <div className="space-y-2">
            <Label>Local</Label>
            <Select
              value={selectedLocal || "todos"}
              onValueChange={(value) => {
                setSelectedLocal(value === "todos" ? "" : value);
                setGenerated(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os locais</SelectItem>
                {availableLocals.map((local) => (
                  <SelectItem key={local} value={local}>
                    {local}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="button" className="gap-2" disabled={loading} onClick={handleGenerate}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Gerar documento
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground print:hidden">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive print:hidden">{error}</Card>
      ) : generated ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{getMonthLabel(month)}</Badge>
              <Badge variant="outline">{selectedLocal || "Todos os locais"}</Badge>
              <Badge variant="outline">{reportRows.length} registros</Badge>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={handleCsv}>
                <Search className="h-4 w-4" />
                CSV
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </div>
          </div>

          <section className="rounded-md border bg-card p-5 print:border-0 print:p-0">
            <div className="mb-4 border-b pb-3">
              <p className="text-sm text-muted-foreground">Almoxarifado</p>
              <h1 className="text-xl text-foreground">Controle de Requisicoes Criadas</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {getMonthLabel(month)} · {selectedLocal || "Todos os locais"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="border px-2 py-2 text-left font-normal">Data</th>
                    <th className="border px-2 py-2 text-left font-normal">Número</th>
                    <th className="border px-2 py-2 text-left font-normal">Tipo de material</th>
                    <th className="border px-2 py-2 text-left font-normal">Solicitante</th>
                    <th className="border px-2 py-2 text-left font-normal">Pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((request) => (
                    <tr key={request.id}>
                      <td className="border px-2 py-2">{formatCreatedDate(request.created_at)}</td>
                      <td className="border px-2 py-2">{request.saida_codigo || request.id}</td>
                      <td className="border px-2 py-2">{request.categoria || "-"}</td>
                      <td className="border px-2 py-2">{request.solicitante || "-"}</td>
                      <td className="border px-2 py-2">{request.pedido}</td>
                    </tr>
                  ))}
                  {reportRows.length === 0 && (
                    <tr>
                      <td className="border px-2 py-8 text-center text-muted-foreground" colSpan={5}>
                        Nenhuma requisição criada para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <Card className="p-6 text-muted-foreground print:hidden">
          Selecione o mês e o local, depois gere o documento para conferência.
        </Card>
      )}
    </div>
  );
}
