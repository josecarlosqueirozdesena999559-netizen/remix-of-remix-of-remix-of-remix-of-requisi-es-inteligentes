import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ListPage, type Column } from "@/components/ListPage";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { supabase } from "@/integrations/supabase/client";
import {
  formatProductCategories,
  parseProductCategories,
  PRODUCT_CATEGORIES,
  sortProductsByMaterialGroup,
} from "@/lib/product-options";

export const Route = createFileRoute("/admin/cadastros/produtos")({
  component: ProdutosPage,
});

interface Item {
  id: string;
  nome: string;
  unidade: string;
  categoria: string;
  subcategoria: string | null;
  programa_produtos?: {
    programas: {
      id: string;
      nome: string;
    } | null;
  }[];
}

interface Programa {
  id: string;
  nome: string;
}

function ProdutosPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== "/admin/cadastros/produtos";
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCategories, setBulkCategories] = useState<string[]>([]);
  const [bulkProgramas, setBulkProgramas] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { data, loading, error } = useSupabaseList<Item>(
    "itens",
    "id,nome,unidade,categoria,subcategoria,programa_produtos(programas(id,nome))",
    { column: "created_at", ascending: false },
    ["itens", "programa_produtos", "programas"],
  );
  const { data: programas = [] } = useSupabaseList<Programa>("programas");

  const selectedItems = useMemo(
    () => (data ?? []).filter((item) => selectedIds.includes(item.id)),
    [data, selectedIds],
  );
  const sortedData = useMemo(() => sortProductsByMaterialGroup(data ?? []), [data]);

  const renderProgramas = (item: Item) => {
    const programas = item.programa_produtos?.map((v) => v.programas?.nome).filter(Boolean) as
      | string[]
      | undefined;

    if (!programas?.length) {
      return <span className="text-muted-foreground">Todos</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {programas.map((programa) => (
          <Badge key={programa} variant="secondary">
            {programa}
          </Badge>
        ))}
      </div>
    );
  };

  const columns: Column<Item>[] = [
    { key: "nome", label: "Nome" },
    {
      key: "categoria",
      label: "Tipo de material",
      render: (r) =>
        formatProductCategories(parseProductCategories(r.categoria || PRODUCT_CATEGORIES[0])),
    },
    { key: "programa_produtos", label: "Visível para", render: renderProgramas },
    { key: "unidade", label: "Unidade" },
  ];

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const toggleAllVisible = (ids: string[]) => {
    setSelectedIds((current) => {
      const allSelected = ids.length > 0 && ids.every((id) => current.includes(id));
      if (allSelected) return current.filter((id) => !ids.includes(id));
      return [...current, ...ids.filter((id) => !current.includes(id))];
    });
  };

  const toggleBulkCategory = (categoria: string) => {
    setBulkCategories((current) =>
      current.includes(categoria)
        ? current.filter((item) => item !== categoria)
        : [...current, categoria],
    );
  };

  const toggleBulkPrograma = (programaId: string) => {
    setBulkProgramas((current) =>
      current.includes(programaId)
        ? current.filter((item) => item !== programaId)
        : [...current, programaId],
    );
  };

  const openBulkEdit = () => {
    setBulkError(null);
    setBulkCategories([]);
    setBulkProgramas([]);
    setBulkOpen(true);
  };

  const handleBulkSave = async () => {
    setBulkSaving(true);
    setBulkError(null);

    if (selectedIds.length === 0) {
      setBulkError("Selecione pelo menos um produto.");
      setBulkSaving(false);
      return;
    }

    if (bulkCategories.length === 0) {
      setBulkError("Selecione pelo menos um tipo de material.");
      setBulkSaving(false);
      return;
    }

    const categoria = formatProductCategories(bulkCategories);
    const itemResult = await supabase
      .from("itens")
      .update({ categoria, subcategoria: null })
      .in("id", selectedIds);

    if (itemResult.error) {
      setBulkError(itemResult.error.message);
      setBulkSaving(false);
      return;
    }

    const deleteResult = await supabase
      .from("programa_produtos")
      .delete()
      .in("item_id", selectedIds);

    if (deleteResult.error) {
      setBulkError(deleteResult.error.message);
      setBulkSaving(false);
      return;
    }

    if (bulkProgramas.length > 0) {
      const insertResult = await supabase.from("programa_produtos").insert(
        selectedIds.flatMap((itemId) =>
          bulkProgramas.map((programaId) => ({
            item_id: itemId,
            programa_id: programaId,
          })),
        ),
      );

      if (insertResult.error) {
        setBulkError(insertResult.error.message);
        setBulkSaving(false);
        return;
      }
    }

    setBulkSaving(false);
    setBulkOpen(false);
    setSelectedIds([]);
  };

  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <>
      <ListPage
        breadcrumb="Cadastros / Produtos"
        title="Produtos"
        description="Itens disponíveis no almoxarifado."
        data={sortedData}
        loading={loading}
        error={error}
        columns={columns}
        searchKeys={["nome", "categoria"]}
        newLabel="Novo produto"
        onNew={() =>
          navigate({
            to: "/admin/cadastros/produtos/$produtoId",
            params: { produtoId: "novo" },
          })
        }
        getRowId={(item) => item.id}
        selectedIds={selectedIds}
        onToggleRow={toggleSelected}
        onToggleAll={toggleAllVisible}
        bulkActions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={selectedIds.length === 0}
            onClick={openBulkEdit}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Aplicar em selecionados ({selectedIds.length})
          </Button>
        }
        actions={(item) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/admin/cadastros/produtos/$produtoId",
                params: { produtoId: item.id },
              })
            }
          >
            Editar
          </Button>
        )}
      />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar produtos selecionados</DialogTitle>
            <DialogDescription>
              As escolhas abaixo serão aplicadas aos {selectedItems.length} produtos marcados.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            <div className="space-y-3">
              <Label>Tipos de material</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRODUCT_CATEGORIES.map((categoria) => (
                  <label
                    key={categoria}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={bulkCategories.includes(categoria)}
                      onCheckedChange={() => toggleBulkCategory(categoria)}
                    />
                    <span>{categoria}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Programas onde vai aparecer</Label>
                <p className="text-sm text-muted-foreground">
                  Sem marcar programa, os produtos ficam liberados para todos.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {programas.map((programa) => (
                  <label
                    key={programa.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={bulkProgramas.includes(programa.id)}
                      onCheckedChange={() => toggleBulkPrograma(programa.id)}
                    />
                    <span>{programa.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" className="gap-2" disabled={bulkSaving} onClick={handleBulkSave}>
              {bulkSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar nos selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
