import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  isCleaningProduct,
  isMedicationProduct,
  normalizeProductSearchValue,
  normalizeProductCategory,
  productMatchesSearch,
  productHasSubcategory,
  productHasCategory,
  sortProductsByMaterialGroup,
} from "@/lib/product-options";
import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import { normalizeProgramKey } from "@/lib/program-options";
import { getCurrentUserProfile, type CurrentUserProfile } from "@/lib/user-profile";
import { notifyRequestByWhatsApp } from "@/lib/whatsapp-edge";

export const Route = createFileRoute("/admin/requisicao")({
  component: CriarRequisicaoPage,
});

interface ItemRow {
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

interface EditableRequestItem {
  item?: string | null;
  nome?: string | null;
  description?: string | null;
  unit?: string | null;
  unidade?: string | null;
  stock?: string | number | null;
  qtdDisponivel?: string | number | null;
  need?: string | number | null;
  qtdNecessaria?: string | number | null;
  quantidade_solicitada?: string | number | null;
  categoria?: string | null;
  subcategoria?: string | null;
  request_section?: string | null;
  request_section_order?: number | null;
}

interface EditableRequest {
  id: string;
  categoria: string | null;
  items: EditableRequestItem[] | null;
  return_reason: string | null;
}

interface RequestSection {
  id: string;
  label: string;
  baseCategory: string;
  matchesItem?: (item: ItemRow) => boolean;
  order: number;
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

const requestSearchStorageKey = "admin:requisicao:search";

function isFoodCleaningCategory(category: string) {
  const normalized = normalizeProductSearchValue(category);
  return normalized.includes("genero") && normalized.includes("limpeza");
}

function isAmbulatorialCategory(category: string) {
  return normalizeProductSearchValue(category) === "ambulatorial";
}

function isExpedienteCategory(category: string) {
  return normalizeProductSearchValue(category) === "expediente";
}

function getProgramMatchKey(value: string | null | undefined) {
  return normalizeProgramKey(value);
}

function getItemProgramKeys(item: ItemRow) {
  return (item.programa_produtos ?? [])
    .map((link) => getProgramMatchKey(link.programas?.nome))
    .filter(Boolean);
}

function itemMatchesSection(item: ItemRow, section: RequestSection) {
  if (productHasCategory(item.categoria, section.baseCategory)) return true;

  const sectionProgram = getProgramMatchKey(section.baseCategory);
  if (!sectionProgram) return false;

  return getItemProgramKeys(item).includes(sectionProgram);
}

function isItemAllowedForProfileProgram(
  item: ItemRow,
  profile: CurrentUserProfile | null,
  section: RequestSection,
) {
  const linkedProgramRows = item.programa_produtos ?? [];
  if (linkedProgramRows.length === 0) return true;

  const linkedPrograms = getItemProgramKeys(item);

  if (linkedPrograms.length === 0) return false;

  const sectionProgram = getProgramMatchKey(section.baseCategory);
  if (sectionProgram && linkedPrograms.includes(sectionProgram)) return true;

  const profilePrograms = [profile?.setor, profile?.unidade_nome]
    .map((value) => getProgramMatchKey(value))
    .filter(Boolean);

  if (profilePrograms.length === 0) return false;

  return linkedPrograms.some((programName) => {
    const linkedProgram = getProgramMatchKey(programName);

    return profilePrograms.some(
      (profileProgram) =>
        linkedProgram === profileProgram ||
        linkedProgram.includes(profileProgram) ||
        profileProgram.includes(linkedProgram),
    );
  });
}

function buildRequestSections(categories: string[]) {
  const sections: RequestSection[] = [];

  categories.forEach((category) => {
    if (category === "GÃªneros alimentÃ­cios/limpeza") {
      sections.push(
        {
          id: "generos-alimenticios",
          label: "Alimentício",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Alimentício") || !isCleaningProduct(item),
          order: 0,
        },
        {
          id: "limpeza",
          label: "Limpeza",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Limpeza") || isCleaningProduct(item),
          order: 1,
        },
      );
      return;
    }

    if (category === "Ambulatorial") {
      sections.push(
        {
          id: "ambulatorial-materiais",
          label: "Material Ambulatorial",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Material Ambulatorial") ||
            !isMedicationProduct(item),
          order: 2,
        },
        {
          id: "ambulatorial-medicamentos",
          label: "Medicamentos",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Medicamentos") || isMedicationProduct(item),
          order: 3,
        },
      );
      return;
    }

    sections.push({
      id: normalizeProductSearchValue(category).replace(/\s+/g, "-"),
      label: category,
      baseCategory: category,
      order: category === "Expediente" ? 4 : 5,
    });
  });

  return sections.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
}

function buildNormalizedRequestSections(categories: string[]) {
  const sections: RequestSection[] = [];

  categories.forEach((category) => {
    if (isFoodCleaningCategory(category)) {
      sections.push(
        {
          id: "generos-alimenticios",
          label: "Alimentício",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "AlimentÃ­cio") || !isCleaningProduct(item),
          order: 0,
        },
        {
          id: "limpeza",
          label: "Limpeza",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Limpeza") || isCleaningProduct(item),
          order: 1,
        },
      );
      return;
    }

    if (isAmbulatorialCategory(category)) {
      sections.push(
        {
          id: "ambulatorial-materiais",
          label: "Material Ambulatorial",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Material Ambulatorial") ||
            !isMedicationProduct(item),
          order: 2,
        },
        {
          id: "ambulatorial-medicamentos",
          label: "Medicamentos",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Medicamentos") || isMedicationProduct(item),
          order: 3,
        },
      );
      return;
    }

    sections.push({
      id: normalizeProductSearchValue(category).replace(/\s+/g, "-"),
      label: category,
      baseCategory: category,
      order: isExpedienteCategory(category) ? 4 : 5,
    });
  });

  return sections.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
}

function getInitialSectionId(sections: RequestSection[], categoria: string | null | undefined) {
  const normalizedCategory = normalizeProductCategory(categoria);
  const firstMatch = sections.find((section) => section.baseCategory === normalizedCategory);
  return firstMatch?.id || sections[0]?.id || "";
}

function getRequestSectionForItem(item: ItemRow, sections: RequestSection[]) {
  return (
    sections.find((section) => {
      if (!productHasCategory(item.categoria, section.baseCategory)) return false;
      if (section.matchesItem && !section.matchesItem(item)) return false;
      return true;
    }) || null
  );
}

function CriarRequisicaoPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

    const savedSearch = window.localStorage.getItem(requestSearchStorageKey) || "";
    setSearchQuery(savedSearch);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(requestSearchStorageKey, searchQuery);
  }, [searchQuery]);

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
            .select("id,nome,unidade,categoria,subcategoria,programa_produtos(programas(id,nome))")
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
          throw new Error(itemsResult.error?.message || requestError?.message || "Erro ao carregar requisição.");
        }

        const categories = getAllowedCategories(profile);
        const loadedItems = (itemsResult.data ?? []) as ItemRow[];

        setProfile(profile);
        setItems(loadedItems);
        setReturnReason(editableRequest?.return_reason || null);

        const availableSections = buildNormalizedRequestSections(categories);
        setSelectedSectionId(getInitialSectionId(availableSections, editableRequest?.categoria));

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
  const sections = useMemo(() => buildNormalizedRequestSections(categories), [categories]);
  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) || sections[0] || null,
    [sections, selectedSectionId],
  );

  useEffect(() => {
    if (!sections.length) {
      setSelectedSectionId("");
      return;
    }

    if (!sections.some((section) => section.id === selectedSectionId)) {
      setSelectedSectionId(sections[0].id);
    }
  }, [sections, selectedSectionId]);

  const visibleItems = useMemo(() => {
    if (!selectedSection) return [];

    return sortProductsByMaterialGroup(
      items.filter((item) => {
        if (!itemMatchesSection(item, selectedSection)) return false;
        if (!isItemAllowedForProfileProgram(item, profile, selectedSection)) return false;
        if (selectedSection.matchesItem && !selectedSection.matchesItem(item)) return false;

        return productMatchesSearch(
          [
            item.nome,
            item.unidade,
            item.categoria,
            item.subcategoria,
            ...(item.programa_produtos ?? []).map((link) => link.programas?.nome),
          ],
          searchQuery,
        );
      }),
      selectedSection.baseCategory,
    );
  }, [items, profile, searchQuery, selectedSection]);

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

    const selectedItems = items
      .map((item) => {
        const quantity = quantities[item.id];
        if (!hasRequestedQuantity(quantity)) return null;

        const section = getRequestSectionForItem(item, sections);
        if (!section) return null;

        return {
          item: item.nome,
          nome: item.nome,
          description: item.nome,
          unit: item.unidade,
          unidade: item.unidade,
          stock: stocks[item.id] || "-",
          qtdDisponivel: stocks[item.id] || "-",
          need: quantity,
          qtdNecessaria: quantity,
          quantidade_solicitada: quantity,
          categoria: item.categoria,
          subcategoria: item.subcategoria,
          request_section: section.label,
          request_section_order: section.order,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const orderDiff = (a.request_section_order ?? 99) - (b.request_section_order ?? 99);
        if (orderDiff !== 0) return orderDiff;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
          sensitivity: "base",
        });
      });

    if (selectedItems.length === 0) {
      setError("Informe a quantidade de pelo menos um item.");
      setSaving(false);
      return;
    }

    const requestCategories = Array.from(
      new Set(
        selectedItems
          .map((item) => item.request_section?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const payload = {
      categoria: requestCategories.join("; ") || selectedSection?.baseCategory || null,
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
    let savedRequestId = editingRequestId;

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
      const insertResult = await supabase.from("requisicoes").insert(payload).select("id").single();
      requestError = insertResult.error;
      savedRequestId = insertResult.data?.id || "";

      if (requestError && isMissingReturnFeedbackColumnError(requestError.message)) {
        const fallbackResult = await supabase
          .from("requisicoes")
          .insert(omitReturnFeedbackFields(payload))
          .select("id")
          .single();

        requestError = fallbackResult.error;
        savedRequestId = fallbackResult.data?.id || "";
      }
    }

    if (requestError) {
      setError(requestError.message);
      setSaving(false);
      return;
    }

    if (savedRequestId) {
      try {
        await notifyRequestByWhatsApp({
          requestId: savedRequestId,
          notificationType: "requestCreated",
        });
      } catch (err) {
        console.error(err);
      }
    }

    setSaving(false);
    navigate({ to: "/admin/minhas-assinaturas" });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Usuário / Requisição</p>
        <h2 className="text-2xl text-foreground">
          {editingRequestId ? "Corrigir requisição" : "Criar requisição"}
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
          Nenhum tipo de material liberado para este usuário.
        </Card>
      ) : (
        <>
          {returnReason && (
            <Card className="border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-medium">Motivo da devolução</p>
              <p className="mt-1 text-sm">{returnReason}</p>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap gap-2">
              {sections.map((section) => (
                <Button
                  key={section.id}
                  type="button"
                  variant={selectedSectionId === section.id ? "default" : "outline"}
                  onClick={() => setSelectedSectionId(section.id)}
                >
                  {section.label}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar item, unidade ou subcategoria..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9 pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Limpar pesquisa"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
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
                        {searchQuery.trim()
                          ? "Nenhum item encontrado para esta pesquisa."
                          : "Nenhum item liberado para este tipo de material."}
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
            {editingRequestId ? "Reenviar requisição" : "Enviar requisição"}
          </Button>
        </>
      )}
    </div>
  );
}
