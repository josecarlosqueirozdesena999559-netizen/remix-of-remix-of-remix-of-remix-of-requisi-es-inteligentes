import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeProductCategory,
  productHasCategory,
  sortProductsByMaterialGroup,
} from "@/lib/product-options";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import { getCurrentUserProfile, type CurrentUserProfile } from "@/lib/user-profile";

export const Route = createFileRoute("/admin/requisicao")({
  component: CriarRequisicaoPage,
});

interface ItemRow {
  id: string;
  nome: string;
  unidade: string;
  categoria: string;
  subcategoria: string | null;
}

interface EditableRequestItem {
  item?: string | null;
  nome?: string | null;
  stock?: string | number | null;
  qtdDisponivel?: string | number | null;
  need?: string | number | null;
  qtdNecessaria?: string | number | null;
  quantidade_solicitada?: string | number | null;
}

interface EditableRequest {
  id: string;
  categoria: string | null;
  items: EditableRequestItem[] | null;
  return_reason: string | null;
}

const requestSelectWithFeedback = "id,categoria,items,return_reason";
const requestSelectFallback = "id,categoria,items";

function getAllowedCategories(profile: CurrentUserProfile | null) {
  const raw = profile?.categorias_permitidas;
  const categories = Array.isArray(raw) ? raw.map(String).map(normalizeProductCategory) : [];
  return categories.filter((category, index) => category && categories.indexOf(category) === index);
}

function formatToday() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
}

function hasRequestedQuantity(value: string | undefined) {
  const quantity = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0;
}

function getItemName(item: EditableRequestItem) {
  return String(item.item || item.nome || "").trim();
}

function CriarRequisicaoPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [returnReason, setReturnReason] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const requestId = new URLSearchParams(window.location.search).get("requisicaoId") || "";
    setEditingRequestId(requestId);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [{ profile }, itemsResult, requestResult] = await Promise.all([
          getCurrentUserProfile(),
          supabase
            .from("itens")
            .select("id,nome,unidade,categoria,subcategoria")
            .order("nome", { ascending: true }),
          editingRequestId
            ? supabase
                .from("requisicoes")
                .select(requestSelectWithFeedback)
                .eq("id", editingRequestId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!active) return;

        let requestError = requestResult.error;
        let editableRequest = requestResult.data as EditableRequest | null;

        if (requestError && editingRequestId && isMissingReturnFeedbackColumnError(requestError.message)) {
          const fallbackResult = await supabase
            .from("requisicoes")
            .select(requestSelectFallback)
            .eq("id", editingRequestId)
            .maybeSingle();

          requestError = fallbackResult.error;
          editableRequest = fallbackResult.data
            ? {
                ...(fallbackResult.data as Omit<EditableRequest, "return_reason">),
                return_reason: null,
              }
            : null;
        }

        if (itemsResult.error || requestError) {
          throw new Error(itemsResult.error?.message || requestError?.message || "Erro ao carregar requisicao.");
        }

        const categories = getAllowedCategories(profile);
        const loadedItems = (itemsResult.data ?? []) as ItemRow[];

        setProfile(profile);
        setItems(loadedItems);
        setReturnReason(editableRequest?.return_reason || null);

        const nextCategory = editableRequest?.categoria || categories[0] || "";
        setSelectedCategory(nextCategory);

        if (editableRequest?.items?.length) {
          const nextStocks: Record<string, string> = {};
          const nextQuantities: Record<string, string> = {};

          editableRequest.items.forEach((requestItem) => {
            const itemName = getItemName(requestItem);
            const matchedItem = loadedItems.find((item) => item.nome.trim() === itemName);
            if (!matchedItem) return;

            nextStocks[matchedItem.id] = String(requestItem.stock ?? requestItem.qtdDisponivel ?? "");
            nextQuantities[matchedItem.id] = String(
              requestItem.need ?? requestItem.qtdNecessaria ?? requestItem.quantidade_solicitada ?? "",
            );
          });

          setStocks(nextStocks);
          setQuantities(nextQuantities);
        } else {
          setStocks({});
          setQuantities({});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar itens.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [editingRequestId]);

  const categories = useMemo(() => getAllowedCategories(profile), [profile]);

  const visibleItems = useMemo(() => {
    return sortProductsByMaterialGroup(
      items.filter((item) => productHasCategory(item.categoria, selectedCategory)),
      selectedCategory,
    );
  }, [items, selectedCategory]);

  const handleQuantityChange = (itemId: string, value: string) => {
    setQuantities((current) => ({ ...current, [itemId]: value }));
  };

  const handleStockChange = (itemId: string, value: string) => {
    setStocks((current) => ({ ...current, [itemId]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    if (!profile) {
      setError("Perfil do usuario nao encontrado.");
      setSaving(false);
      return;
    }

    const selectedItems = visibleItems
      .map((item) => ({
        item: item.nome,
        nome: item.nome,
        description: item.nome,
        unit: item.unidade,
        unidade: item.unidade,
        stock: stocks[item.id] || "-",
        qtdDisponivel: stocks[item.id] || "-",
        need: quantities[item.id],
        qtdNecessaria: quantities[item.id],
        quantidade_solicitada: quantities[item.id],
        categoria: selectedCategory || item.categoria,
      }))
      .filter((item) => hasRequestedQuantity(item.need));

    if (selectedItems.length === 0) {
      setError("Informe a quantidade de pelo menos um item.");
      setSaving(false);
      return;
    }

    const payload = {
      categoria: selectedCategory || null,
      setor: profile.unidade_nome || profile.setor,
      solicitante: profile.nome,
      solicitante_cpf: profile.cpf,
      solicitante_funcao: profile.funcao,
      data: formatToday(),
      status: "aguardando_assinatura",
      items: selectedItems,
      signed_attachment: null,
      admin_attachment: null,
      return_reason: null,
      return_target: null,
      returned_at: null,
    };

    let requestError = null;

    if (editingRequestId) {
      const updateResult = await supabase.from("requisicoes").update(payload).eq("id", editingRequestId);
      requestError = updateResult.error;

      if (requestError && isMissingReturnFeedbackColumnError(requestError.message)) {
        const fallbackResult = await supabase
          .from("requisicoes")
          .update(omitReturnFeedbackFields(payload))
          .eq("id", editingRequestId);

        requestError = fallbackResult.error;
      }
    } else {
      const insertResult = await supabase.from("requisicoes").insert(payload);
      requestError = insertResult.error;

      if (requestError && isMissingReturnFeedbackColumnError(requestError.message)) {
        const fallbackResult = await supabase
          .from("requisicoes")
          .insert(omitReturnFeedbackFields(payload));

        requestError = fallbackResult.error;
      }
    }

    if (requestError) {
      setError(requestError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate({ to: "/admin/minhas-assinaturas" });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuario / Requisicao</p>
        <h2 className="text-2xl text-foreground">
          {editingRequestId ? "Corrigir requisicao" : "Criar requisicao"}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      ) : error ? (
        <Card className="p-6 text-destructive">{error}</Card>
      ) : categories.length === 0 ? (
        <Card className="p-6 text-muted-foreground">
          Nenhum tipo de material liberado para este usuario.
        </Card>
      ) : (
        <>
          {returnReason && (
            <Card className="border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-medium">Motivo da devolucao</p>
              <p className="mt-1 text-sm">{returnReason}</p>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  type="button"
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="rounded-md overflow-x-auto border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">Item</th>
                    <th className="px-3 py-2 text-left font-normal">Unidade</th>
                    <th className="px-3 py-2 text-left font-normal">Quanto tem</th>
                    <th className="px-3 py-2 text-left font-normal">Quanto precisa</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2 text-foreground">{item.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.unidade}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          value={stocks[item.id] ?? ""}
                          onChange={(event) => handleStockChange(item.id, event.target.value)}
                          className="w-28"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          value={quantities[item.id] ?? ""}
                          onChange={(event) => handleQuantityChange(item.id, event.target.value)}
                          className="w-28"
                          placeholder="0"
                        />
                      </td>
                    </tr>
                  ))}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                        Nenhum item liberado para este tipo de material.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="button" className="gap-2" disabled={saving} onClick={handleSubmit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {editingRequestId ? "Reenviar requisicao" : "Enviar requisicao"}
          </Button>
        </>
      )}
    </div>
  );
}
