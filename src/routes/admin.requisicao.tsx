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

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [{ profile }, itemsResult] = await Promise.all([
          getCurrentUserProfile(),
          supabase
            .from("itens")
            .select("id,nome,unidade,categoria,subcategoria")
            .order("nome", { ascending: true }),
        ]);

        if (!active) return;

        if (itemsResult.error) throw new Error(itemsResult.error.message);

        const categories = getAllowedCategories(profile);
        setProfile(profile);
        setItems((itemsResult.data ?? []) as ItemRow[]);
        setSelectedCategory(categories[0] ?? "");
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
  }, []);

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
      setError("Perfil do usuário não encontrado.");
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

    const { error } = await supabase.from("requisicoes").insert({
      categoria: selectedCategory || null,
      setor: profile.unidade_nome || profile.setor,
      solicitante: profile.nome,
      solicitante_cpf: profile.cpf,
      solicitante_funcao: profile.funcao,
      data: formatToday(),
      status: "aguardando_assinatura",
      items: selectedItems,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate({ to: "/admin/minhas-assinaturas" });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuário / Requisição</p>
        <h2 className="text-2xl text-foreground">Criar requisição</h2>
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
          Nenhum tipo de material liberado para este usuário.
        </Card>
      ) : (
        <>
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
            <div className="rounded-md border overflow-x-auto">
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
            Enviar requisição
          </Button>
        </>
      )}
    </div>
  );
}
