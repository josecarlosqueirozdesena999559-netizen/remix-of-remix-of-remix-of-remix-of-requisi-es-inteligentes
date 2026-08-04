import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Search, UserCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  isCleaningProduct,
  isMedicationProduct,
  normalizeProductCategory,
  normalizeProductSearchValue,
  productHasCategory,
  productHasSubcategory,
  PRODUCT_CATEGORIES,
} from "@/lib/product-options";
import {
  BLOCK_NEW_REQUEST_MESSAGE,
  hasPendingRequestSignatures,
} from "@/lib/pending-request-signatures";
import { getRelatedProgramKeys, normalizeProgramKey } from "@/lib/program-options";

import {
  isMissingReturnFeedbackColumnError,
  omitReturnFeedbackFields,
} from "@/lib/request-return-feedback";
import {
  getCurrentUserProfile,
  isHospitalSharedProfile,
  type CurrentUserProfile,
} from "@/lib/user-profile";
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

interface SectorUserOption {
  id: string;
  nome: string;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
}

interface EditableRequestItem {
  item_id?: string | null;
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
  status: string | null;
  solicitante: string | null;
  solicitante_cpf: string | null;
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

interface RequestSectionGroup {
  label: string;
  sections: RequestSection[];
}

interface SetorPermissionRow {
  categorias_permitidas: unknown;
}

interface ResponsibleSectorProgramRow {
  programas: {
    nome: string | null;
  } | null;
}

const requestSelectWithFeedback =
  "id,categoria,status,solicitante,solicitante_cpf,items,return_reason";
const requestSelectFallback = "id,categoria,status,solicitante,solicitante_cpf,items";
const productCategorySet = new Set<string>(PRODUCT_CATEGORIES);

function isProductCategory(value: string) {
  return productCategorySet.has(value);
}

function getAllowedCategories(profile: CurrentUserProfile | null) {
  const raw = profile?.categorias_permitidas;
  const categories = Array.isArray(raw) ? raw.map(String).map(normalizeProductCategory) : [];
  return categories.filter(
    (category, index) =>
      category && isProductCategory(category) && categories.indexOf(category) === index,
  );
}

function normalizeAllowedCategories(raw: unknown) {
  const categories = Array.isArray(raw) ? raw.map(String).map(normalizeProductCategory) : [];
  return categories.filter(
    (category, index) =>
      category && isProductCategory(category) && categories.indexOf(category) === index,
  );
}

async function getAllowedCategoriesForRequest(profile: CurrentUserProfile | null) {
  if (!profile) return [];

  const sectorCandidates = [profile.unidade_nome, profile.setor]
    .map((value) => String(value || "").trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);

  for (const sectorName of sectorCandidates) {
    const { data, error } = await supabase
      .from("setores")
      .select("categorias_permitidas")
      .eq("nome", sectorName)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const sectorCategories = normalizeAllowedCategories(
      (data as SetorPermissionRow | null)?.categorias_permitidas,
    );

    if (sectorCategories.length > 0) {
      return sectorCategories;
    }
  }

  return getAllowedCategories(profile);
}

async function getResponsibleSectorProgramKeys(profile: CurrentUserProfile | null) {
  if (!profile?.id) return [];

  const { data: setorLinks, error: setorLinksError } = await supabase
    .from("setor_responsaveis")
    .select("setor_id")
    .eq("usuario_id", profile.id);

  if (setorLinksError) throw new Error(setorLinksError.message);

  const setorIds = (setorLinks ?? [])
    .map((link) => link.setor_id)
    .filter((id, index, ids) => id != null && ids.indexOf(id) === index);

  if (setorIds.length === 0) return [];

  const { data, error } = await supabase
    .from("setor_programas")
    .select("programas(nome)")
    .in("setor_id", setorIds);

  if (error) throw new Error(error.message);

  const programKeys = ((data ?? []) as ResponsibleSectorProgramRow[]).flatMap((link) =>
    getComparableProgramKeys(link.programas?.nome),
  );

  return programKeys.filter((key, index, keys) => key && keys.indexOf(key) === index);
}

function formatToday() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
}

function hasRequestedQuantity(value: string | undefined) {
  const quantity = Number(
    String(value ?? "")
      .trim()
      .replace(",", "."),
  );
  return Number.isFinite(quantity) && quantity > 0;
}

function canEditRequestBeforeSignature(request: EditableRequest | null) {
  if (!request) return false;
  return (
    request.status === "aguardando_assinatura" ||
    request.status === "aguardando_assinatura_requisicao" ||
    request.status === "correcao_requisicao"
  );
}

function getItemName(item: EditableRequestItem) {
  return String(item.item || item.nome || "").trim();
}

function findMatchingLoadedItem(
  requestItem: EditableRequestItem,
  loadedItems: ItemRow[],
  sections: RequestSection[],
) {
  const savedItemId = String(requestItem.item_id ?? "").trim();
  if (savedItemId) {
    const matchedById = loadedItems.find((item) => item.id === savedItemId);
    if (matchedById) return matchedById;
  }

  const itemName = getItemName(requestItem);
  if (!itemName) return null;

  const normalizedUnit = String(requestItem.unit ?? requestItem.unidade ?? "")
    .trim()
    .toLowerCase();
  const normalizedCategory = normalizeProductCategory(requestItem.categoria);
  const normalizedSubcategory = normalizeProductCategory(requestItem.subcategoria);
  const normalizedSection = String(requestItem.request_section ?? "")
    .trim()
    .toLowerCase();
  const sectionOrder = requestItem.request_section_order ?? null;

  const candidates = loadedItems.filter((item) => item.nome.trim() === itemName);
  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const exactMatch = candidates.find((item) => {
    const itemSection = getRequestSectionForItem(item, sections);
    const sameUnit = !normalizedUnit || item.unidade.trim().toLowerCase() === normalizedUnit;
    const sameCategory =
      !normalizedCategory || normalizeProductCategory(item.categoria) === normalizedCategory;
    const sameSubcategory =
      !normalizedSubcategory ||
      normalizeProductCategory(item.subcategoria) === normalizedSubcategory;
    const sameSectionLabel =
      !normalizedSection || itemSection?.label.trim().toLowerCase() === normalizedSection;
    const sameSectionOrder = sectionOrder == null || itemSection?.order === sectionOrder;

    return sameUnit && sameCategory && sameSubcategory && sameSectionLabel && sameSectionOrder;
  });

  if (exactMatch) return exactMatch;

  return (
    candidates.find((item) => {
      const sameUnit = !normalizedUnit || item.unidade.trim().toLowerCase() === normalizedUnit;
      const sameCategory =
        !normalizedCategory || normalizeProductCategory(item.categoria) === normalizedCategory;

      return sameUnit && sameCategory;
    }) ??
    candidates[0] ??
    null
  );
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

function getComparableProgramKeys(value: string | null | undefined) {
  return getRelatedProgramKeys(value);
}

function buildNormalizedRequestSections(categories: string[]) {
  const sections: RequestSection[] = [];

  categories.forEach((category) => {
    if (category === "Gêneros alimentícios/limpeza") {
      sections.push(
        {
          id: "generos-alimenticios",
          label: "Alimentos",
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

    if (isAmbulatorialCategory(category)) {
      sections.push(
        {
          id: "ambulatorial-materiais",
          label: "Material Ambulatorial",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Material Ambulatorial") ||
            !isMedicationProduct(item),
          order: 3,
        },
        {
          id: "ambulatorial-medicamentos",
          label: "Medicamentos",
          baseCategory: category,
          matchesItem: (item) =>
            productHasSubcategory(item.subcategoria, "Medicamentos") || isMedicationProduct(item),
          order: 4,
        },
      );
      return;
    }

    sections.push({
      id: normalizeProductSearchValue(category).replace(/\s+/g, "-"),
      label: category,
      baseCategory: category,
      order: isExpedienteCategory(category) ? 2 : 5,
    });
  });

  return sections.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "pt-BR"));
}

function getSectionGroupLabel(section: RequestSection) {
  if (isFoodCleaningCategory(section.baseCategory)) return "Gêneros alimentícios/limpeza";
  if (isExpedienteCategory(section.baseCategory)) return "Material de expediente";
  if (isAmbulatorialCategory(section.baseCategory)) return "Ambulatorial";
  return section.baseCategory;
}

function groupRequestSections(sections: RequestSection[]) {
  return sections.reduce<RequestSectionGroup[]>((groups, section) => {
    const label = getSectionGroupLabel(section);
    const existingGroup = groups.find((group) => group.label === label);

    if (existingGroup) {
      existingGroup.sections.push(section);
    } else {
      groups.push({ label, sections: [section] });
    }

    return groups;
  }, []);
}

function getInitialSectionId(sections: RequestSection[], categoria: string | null | undefined) {
  const normalizedCategory = normalizeProductCategory(categoria);
  const firstMatch = sections.find((section) => section.baseCategory === normalizedCategory);
  return firstMatch?.id || sections[0]?.id || "";
}

function getRequestSectionForItem(item: ItemRow, sections: RequestSection[]) {
  return (
    sections.find((section) => {
      return (
        productHasCategory(item.categoria, section.baseCategory) &&
        (!section.matchesItem || section.matchesItem(item))
      );
    }) || null
  );
}

function getItemRequestCategory(item: ItemRow, sections: RequestSection[]) {
  const section = getRequestSectionForItem(item, sections);
  return section?.baseCategory || normalizeProductCategory(item.categoria);
}

function getSelectedRequestCategories(
  items: ItemRow[],
  quantities: Record<string, string>,
  sections: RequestSection[],
) {
  return Array.from(
    new Set(
      items
        .filter((item) => hasRequestedQuantity(quantities[item.id]))
        .map((item) => getItemRequestCategory(item, sections))
        .filter(Boolean),
    ),
  );
}

function getSingleCategoryRequestMessage(category: string) {
  return `Esta requisição já tem itens de ${category}. Envie primeiro e depois faça outra requisição para outra categoria.`;
}

function getRequestSaveErrorMessage(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || "").trim();
  if (!message) return "Não foi possível enviar a requisição. Tente novamente.";

  if (error?.code === "P0001" || /database|databate|1000|P0001/i.test(message)) {
    return "Não foi possível enviar a requisição. Confira se os itens pertencem a uma única categoria e tente novamente.";
  }

  return message;
}

function CriarRequisicaoPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [allowedCategories, setAllowedCategories] = useState<string[]>([]);
  const [allowedProgramKeys, setAllowedProgramKeys] = useState<string[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [sectorUsers, setSectorUsers] = useState<SectorUserOption[]>([]);
  const [selectedSolicitanteId, setSelectedSolicitanteId] = useState<string>("");

  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedGroupLabel, setSelectedGroupLabel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState("");
  const [editingRequestStatus, setEditingRequestStatus] = useState<string | null>(null);
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
        const [{ profile }, itemsResult, requestResult, usuariosResult] = await Promise.all([
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
          supabase
            .from("usuarios")
            .select("id,nome,cpf,funcao,setor,unidade_nome")
            .order("nome", { ascending: true }),
        ]);

        if (!active) return;

        let requestError = requestResult.error;
        let editableRequest = requestResult.data as EditableRequest | null;

        if (
          requestError &&
          editingRequestId &&
          isMissingReturnFeedbackColumnError(requestError.message)
        ) {
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
          throw new Error(
            itemsResult.error?.message || requestError?.message || "Erro ao carregar requisição.",
          );
        }

        if (editingRequestId && !canEditRequestBeforeSignature(editableRequest)) {
          throw new Error("Esta requisição já foi assinada e não pode mais ser editada.");
        }

        if (!editingRequestId && profile) {
          const hasPendingSignature = await hasPendingRequestSignatures(profile);

          if (hasPendingSignature) {
            throw new Error(BLOCK_NEW_REQUEST_MESSAGE);
          }
        }

        const [profileCategories, profileProgramKeys] = await Promise.all([
          getAllowedCategoriesForRequest(profile),
          getResponsibleSectorProgramKeys(profile),
        ]);
        const categories =
          profileCategories.length > 0 || profileProgramKeys.length === 0
            ? profileCategories
            : [...PRODUCT_CATEGORIES];
        const loadedItems = (itemsResult.data ?? []) as ItemRow[];

        // FILTRAR USUÁRIOS DO SETOR DA UNIDADE
        const allUsers = (usuariosResult.data ?? []) as SectorUserOption[];
        const sectorName = profile?.unidade_nome || profile?.setor || "";

        let filteredSectorUsers = allUsers;
        if (sectorName) {
          filteredSectorUsers = allUsers.filter(
            (u) =>
              u.setor?.toLowerCase() === sectorName.toLowerCase() ||
              u.unidade_nome?.toLowerCase() === sectorName.toLowerCase(),
          );
        }

        if (filteredSectorUsers.length === 0 && !isHospitalSharedProfile(profile)) {
          filteredSectorUsers = allUsers;
        }

        setProfile(profile);
        setSectorUsers(filteredSectorUsers);

        // Se editando requisição existente, seleciona o solicitante correspondente
        if (editableRequest?.solicitante_cpf) {
          const matchedUser = filteredSectorUsers.find(
            (u) => u.cpf?.trim() === editableRequest.solicitante_cpf?.trim(),
          );
          if (matchedUser) {
            setSelectedSolicitanteId(matchedUser.id);
          } else if (profile) {
            setSelectedSolicitanteId(profile.id);
          }
        } else if (profile) {
          setSelectedSolicitanteId(profile.id);
        }

        setAllowedCategories(categories);
        setAllowedProgramKeys(profileProgramKeys);
        setItems(loadedItems);
        setEditingRequestStatus(editableRequest?.status || null);
        setReturnReason(editableRequest?.return_reason || null);

        const availableSections = buildNormalizedRequestSections(categories);
        setSelectedSectionId(getInitialSectionId(availableSections, editableRequest?.categoria));

        if (editableRequest?.items?.length) {
          const nextStocks: Record<string, string> = {};
          const nextQuantities: Record<string, string> = {};

          editableRequest.items.forEach((requestItem) => {
            const matchedItem = findMatchingLoadedItem(requestItem, loadedItems, availableSections);
            if (!matchedItem) return;

            nextStocks[matchedItem.id] = String(
              requestItem.stock ?? requestItem.qtdDisponivel ?? "",
            );
            nextQuantities[matchedItem.id] = String(
              requestItem.need ??
                requestItem.qtdNecessaria ??
                requestItem.quantidade_solicitada ??
                "",
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

  const categories = allowedCategories;
  const sections = useMemo(() => buildNormalizedRequestSections(categories), [categories]);
  const sectionGroups = useMemo(() => groupRequestSections(sections), [sections]);
  const isCorrectionEdit = editingRequestStatus === "correcao_requisicao";
  const returnPath = editingRequestId ? "/admin/minhas-assinaturas" : "/admin";
  const selectedGroup = useMemo(
    () =>
      sectionGroups.find((group) => group.label === selectedGroupLabel) || sectionGroups[0] || null,
    [sectionGroups, selectedGroupLabel],
  );

  const visibleSectionTables = useMemo(() => {
    if (!selectedGroup) return [];

    const query = normalizeProductSearchValue(searchQuery);

    return selectedGroup.sections
      .map((section) => {
        const sectionItems = items.filter((item) => {
          if (!productHasCategory(item.categoria, section.baseCategory)) return false;
          if (section.matchesItem && !section.matchesItem(item)) return false;

          if (!isItemAllowedForProfileProgram(item, profile, section, allowedProgramKeys)) {
            return false;
          }

          if (!query) return true;
          return productMatchesSearch(item, query);
        });

        return {
          section,
          items: sortProductsByMaterialGroup(sectionItems),
        };
      })
      .filter(({ items }) => items.length > 0);
  }, [selectedGroup, items, searchQuery, profile, allowedProgramKeys]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);

    if (!profile) {
      setError("Perfil do usuário não encontrado.");
      setSaving(false);
      return;
    }

    const chosenSolicitante = sectorUsers.find((u) => u.id === selectedSolicitanteId) || profile;

    const selectedItems = items
      .map((item) => {
        const quantity = quantities[item.id];
        if (!hasRequestedQuantity(quantity)) return null;

        const section = getRequestSectionForItem(item, sections);
        if (!section) return null;

        return {
          item_id: item.id,
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

    const selectedBaseCategories = getSelectedRequestCategories(items, quantities, sections);
    if (selectedBaseCategories.length > 1) {
      setError(getSingleCategoryRequestMessage(selectedBaseCategories[0]));
      setSaving(false);
      return;
    }

    const requestCategory =
      selectedBaseCategories[0] || selectedGroup?.sections[0]?.baseCategory || null;

    const payload = {
      categoria: requestCategory,
      setor: profile.unidade_nome || profile.setor,
      solicitante: chosenSolicitante.nome,
      solicitante_cpf: chosenSolicitante.cpf?.trim() || profile.cpf?.trim() || null,
      solicitante_funcao: chosenSolicitante.funcao || profile.funcao,
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
      const updateResult = await supabase
        .from("requisicoes")
        .update(payload)
        .eq("id", editingRequestId)
        .in("status", [
          "aguardando_assinatura",
          "aguardando_assinatura_requisicao",
          "correcao_requisicao",
        ]);
      requestError = updateResult.error;

      if (requestError && isMissingReturnFeedbackColumnError(requestError.message)) {
        const fallbackResult = await supabase
          .from("requisicoes")
          .update(omitReturnFeedbackFields(payload))
          .eq("id", editingRequestId)
          .in("status", [
            "aguardando_assinatura",
            "aguardando_assinatura_requisicao",
            "correcao_requisicao",
          ]);

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
      setError(getRequestSaveErrorMessage(requestError));
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
        console.error("Erro ao enviar notificação WhatsApp:", err);
      }
    }

    setSaving(false);
    navigate({ to: "/admin/minhas-assinaturas" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mt-0.5 text-xs text-slate-500">Selecione uma categoria por envio</p>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">
            {editingRequestId
              ? isCorrectionEdit
                ? "Corrigir requisição"
                : "Editar requisição"
              : "Criar requisição"}
          </h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-xl"
          disabled={saving}
          onClick={() => navigate({ to: returnPath })}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      {loading ? (
        <Card className="flex items-center gap-2 rounded-2xl border-slate-200 bg-white p-6 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          Carregando...
        </Card>
      ) : error ? (
        <Card className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 font-medium text-destructive">
          {error}
        </Card>
      ) : categories.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 bg-white p-6 text-slate-500">
          Nenhum tipo de material liberado para este usuário.
        </Card>
      ) : (
        <>
          {returnReason && (
            <Card className="rounded-2xl border-amber-200 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-medium">Motivo da devolução</p>
              <p className="mt-1 text-sm">{returnReason}</p>
            </Card>
          )}

          {/* SELETOR DO SOLICITANTE RESPONSÁVEL DO SETOR */}
          <Card className="rounded-2xl border-slate-200/80 bg-white p-4 shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Solicitante Responsável do Setor ({profile?.unidade_nome || profile?.setor || "Geral"}
              )
            </div>
            <div className="max-w-md space-y-1">
              <Label htmlFor="select-solicitante" className="text-xs text-slate-500 font-normal">
                Selecione o profissional que está fazendo esta solicitação:
              </Label>
              <select
                id="select-solicitante"
                value={selectedSolicitanteId}
                onChange={(e) => setSelectedSolicitanteId(e.target.value)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {sectorUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nome} {user.funcao ? `(${user.funcao})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <Card className="rounded-2xl border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap gap-2">
              {sectionGroups.map((group) => (
                <Button
                  key={group.label}
                  type="button"
                  variant={selectedGroup?.label === group.label ? "default" : "outline"}
                  onClick={() => {
                    setSelectedGroupLabel(group.label);
                    setSelectedSectionId(group.sections[0]?.id || "");
                  }}
                >
                  {group.label}
                </Button>
              ))}
            </div>
          </Card>

          <Card className="rounded-2xl border-slate-200/80 bg-white p-4 shadow-xs">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar item, unidade ou subcategoria..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="rounded-xl pl-9 pr-10"
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

          <div className="space-y-6">
            {visibleSectionTables.map(({ section, items: sectionItems }) => (
              <Card
                key={section.id}
                className="rounded-2xl border-slate-200/80 bg-white p-4 shadow-xs"
              >
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-700">
                  {section.label}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Item</th>
                        <th className="px-4 py-3 text-left">Unidade</th>
                        <th className="px-4 py-3 text-center w-36">Estoque</th>
                        <th className="px-4 py-3 text-center w-36">Qtd. Solicitada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {sectionItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-800">{item.nome}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{item.unidade}</td>
                          <td className="px-4 py-2 text-center">
                            <Input
                              type="text"
                              value={stocks[item.id] || ""}
                              onChange={(e) =>
                                setStocks((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder="-"
                              className="h-8 text-center text-xs rounded-lg border-slate-200"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Input
                              type="text"
                              value={quantities[item.id] || ""}
                              onChange={(e) =>
                                setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              placeholder="0"
                              className="h-8 text-center text-xs rounded-lg border-slate-200 font-semibold text-emerald-700"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit()}
              className="gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 px-6 font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingRequestId ? "Salvar alterações" : "Enviar requisição"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
