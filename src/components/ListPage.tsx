import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Search } from "lucide-react";
import { useState, useMemo } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  breadcrumb: string;
  title: string;
  description?: string;
  data: T[] | undefined;
  loading: boolean;
  error?: string | null;
  columns: Column<T>[];
  searchKeys?: (keyof T)[];
  onNew?: () => void;
  newLabel?: string;
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
  bulkActions?: ReactNode;
  getRowId?: (row: T) => string;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
}

export function ListPage<T>({
  breadcrumb,
  title,
  description,
  data,
  loading,
  error,
  columns,
  searchKeys,
  onNew,
  newLabel = "Novo",
  emptyMessage = "Nenhum registro encontrado.",
  actions,
  bulkActions,
  getRowId,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const hasSelection = Boolean(getRowId && onToggleRow && onToggleAll);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!query.trim() || !searchKeys?.length) return data;
    const q = query.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((k) =>
        String(row[k] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data, query, searchKeys]);

  const filteredIds = useMemo(
    () => (getRowId ? filtered.map((row) => getRowId(row)) : []),
    [filtered, getRowId],
  );
  const selectedFilteredCount = filteredIds.filter((id) => selectedIds.includes(id)).length;
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredCount === filteredIds.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{breadcrumb}</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {onNew && (
          <Button onClick={onNew} className="w-full gap-2 sm:w-auto">
            <Plus className="h-4 w-4" />
            {newLabel}
          </Button>
        )}
      </div>

      <Card className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          {searchKeys && searchKeys.length > 0 && (
            <div className="relative w-full sm:max-w-sm sm:flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {bulkActions ? <div className="w-full sm:w-auto">{bulkActions}</div> : null}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {hasSelection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={() => onToggleAll?.(filteredIds)}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                )}
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.className}>
                    {c.label}
                  </TableHead>
                ))}
                {actions && <TableHead className="w-28 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0) + (hasSelection ? 1 : 0)}
                    className="h-32 text-center"
                  >
                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando...
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0) + (hasSelection ? 1 : 0)}
                    className="h-32 text-center text-destructive"
                  >
                    {error}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (actions ? 1 : 0) + (hasSelection ? 1 : 0)}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, i) => (
                  <TableRow key={((row as any).id as string) ?? i}>
                    {hasSelection && getRowId && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(getRowId(row))}
                          onCheckedChange={() => onToggleRow?.(getRowId(row))}
                          aria-label="Selecionar registro"
                        />
                      </TableCell>
                    )}
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {c.render ? c.render(row) : (((row as any)[c.key] as ReactNode) ?? "—")}
                      </TableCell>
                    ))}
                    {actions && <TableCell className="text-right">{actions(row)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && !error && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </p>
        )}
      </Card>
    </div>
  );
}
