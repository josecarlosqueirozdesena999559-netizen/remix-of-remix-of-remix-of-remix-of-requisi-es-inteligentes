export const PRODUCT_CATEGORIES = [
  "Gêneros alimentícios/limpeza",
  "Ambulatorial",
  "Odontológico",
  "SESB",
  "Expediente",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

const CATEGORY_SEPARATOR = ";";

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  "Generos alimenticio/limpeza": "Gêneros alimentícios/limpeza",
  "Gêneros alimenticio/limpeza": "Gêneros alimentícios/limpeza",
  "Generos alimentícios/limpeza": "Gêneros alimentícios/limpeza",
  "Gêneros alimentícios/limpeza": "Gêneros alimentícios/limpeza",
  Odontologico: "Odontológico",
  Odontológico: "Odontológico",
  Ambulatorial: "Ambulatorial",
  SESB: "SESB",
  Expediente: "Expediente",
};

export function normalizeProductCategory(value: string | null | undefined) {
  const cleanValue = String(value || "").trim();
  return CATEGORY_ALIASES[cleanValue] ?? cleanValue;
}

export function parseProductCategories(value: string | null | undefined) {
  return String(value || "")
    .split(CATEGORY_SEPARATOR)
    .map(normalizeProductCategory)
    .filter(Boolean);
}

export function formatProductCategories(categories: string[]) {
  const uniqueCategories = categories.filter(
    (category, index) => category && categories.indexOf(category) === index,
  );

  return uniqueCategories.join(`${CATEGORY_SEPARATOR} `);
}

export function productHasCategory(value: string | null | undefined, category: string) {
  return parseProductCategories(value).includes(category);
}

interface ProductOrderItem {
  nome?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
}

export function normalizeProductSearchValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getPriorityGroup(item: ProductOrderItem, activeCategory?: string) {
  const category = normalizeProductSearchValue(activeCategory || item.categoria);
  const subcategory = normalizeProductSearchValue(item.subcategoria);
  const name = normalizeProductSearchValue(item.nome);
  const searchable = `${subcategory} ${name}`;

  if (category.includes("aliment") || category.includes("limpeza")) {
    if (searchable.includes("limpeza")) return 1;
    if (searchable.includes("aliment") || searchable.includes("genero")) return 0;
    return 0;
  }

  if (category.includes("ambulatorial")) {
    if (searchable.includes("medicamento") || searchable.includes("remedio")) return 1;
    if (searchable.includes("material")) return 0;
    return 0;
  }

  return 0;
}

export function isCleaningProduct(item: ProductOrderItem) {
  const searchable = `${normalizeProductSearchValue(item.subcategoria)} ${normalizeProductSearchValue(item.nome)}`;
  return searchable.includes("limpeza");
}

export function isMedicationProduct(item: ProductOrderItem) {
  const searchable = `${normalizeProductSearchValue(item.subcategoria)} ${normalizeProductSearchValue(item.nome)}`;
  return searchable.includes("medicamento") || searchable.includes("remedio");
}

export function sortProductsByMaterialGroup<T extends ProductOrderItem>(
  items: T[],
  activeCategory?: string,
) {
  return [...items].sort((a, b) => {
    const groupDiff = getPriorityGroup(a, activeCategory) - getPriorityGroup(b, activeCategory);
    if (groupDiff !== 0) return groupDiff;

    return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR", {
      sensitivity: "base",
    });
  });
}
