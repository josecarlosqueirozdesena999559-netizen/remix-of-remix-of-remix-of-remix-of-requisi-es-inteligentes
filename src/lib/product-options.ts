export const PRODUCT_CATEGORIES = [
  "Gêneros alimentícios/limpeza",
  "Ambulatorial",
  "Odontológico",
  "SESB",
  "Expediente",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const PRODUCT_SUBCATEGORIES = [
  "Alimentício",
  "Limpeza",
  "Material Ambulatorial",
  "Medicamentos",
  "Expediente",
] as const;

export type ProductSubcategory = (typeof PRODUCT_SUBCATEGORIES)[number];

const CATEGORY_SEPARATOR = ";";

const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  "Generos alimenticio/limpeza": "Gêneros alimentícios/limpeza",
  "Gêneros alimenticio/limpeza": "Gêneros alimentícios/limpeza",
  "Generos alimentícios/limpeza": "Gêneros alimentícios/limpeza",
  "Gêneros alimentícios/limpeza": "Gêneros alimentícios/limpeza",
  "GÃªneros alimentÃ­cios/limpeza": "Gêneros alimentícios/limpeza",
  "GÃªneros alimenticio/limpeza": "Gêneros alimentícios/limpeza",
  "Generos alimentÃ­cios/limpeza": "Gêneros alimentícios/limpeza",
  Odontologico: "Odontológico",
  Odontológico: "Odontológico",
  "OdontolÃ³gico": "Odontológico",
  Ambulatorial: "Ambulatorial",
  SESB: "SESB",
  Expediente: "Expediente",
};

const NORMALIZED_CATEGORY_ALIASES = new Map<string, ProductCategory>(
  Object.entries(CATEGORY_ALIASES).map(([alias, category]) => [
    normalizeProductSearchValue(alias),
    category,
  ]),
);

export function normalizeProductCategory(value: string | null | undefined) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";

  return (
    CATEGORY_ALIASES[cleanValue] ??
    NORMALIZED_CATEGORY_ALIASES.get(normalizeProductSearchValue(cleanValue)) ??
    cleanValue
  );
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
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PRODUCT_SEARCH_ALIASES: Record<string, string[]> = {
  cx: ["caixa"],
  und: ["unidade"],
  un: ["unidade"],
  pct: ["pacote"],
  pcte: ["pacote"],
  fr: ["frasco"],
  lt: ["litro"],
  comp: ["comprimido"],
};

export function tokenizeProductSearchValue(value: string | null | undefined) {
  const tokens = normalizeProductSearchValue(value).split(" ").filter(Boolean);
  return tokens.flatMap((token) => [token, ...(PRODUCT_SEARCH_ALIASES[token] ?? [])]);
}

export function productMatchesSearch(
  values: Array<string | null | undefined>,
  search: string | null | undefined,
) {
  const searchTokens = tokenizeProductSearchValue(search);
  if (!searchTokens.length) return true;

  const searchableTokens = values.flatMap(tokenizeProductSearchValue);
  const searchableText = ` ${searchableTokens.join(" ")} `;

  return searchTokens.every((token) => {
    const singularToken = token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
    return (
      searchableTokens.some(
        (value) =>
          value === token ||
          value === singularToken ||
          value.includes(token) ||
          value.includes(singularToken),
      ) ||
      searchableText.includes(` ${token} `) ||
      searchableText.includes(` ${singularToken} `)
    );
  });
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

export function productHasSubcategory(
  value: string | null | undefined,
  subcategory: ProductSubcategory,
) {
  return normalizeProductSearchValue(value) === normalizeProductSearchValue(subcategory);
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
