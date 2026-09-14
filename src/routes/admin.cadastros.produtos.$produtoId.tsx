import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Save, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
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
import { PRODUCT_IMAGES_BUCKET, sanitizeFileName } from "@/lib/file-upload";
import {
  formatProductCategories,
  normalizeProductSearchValue,
  parseProductCategories,
  PRODUCT_CATEGORIES,
  PRODUCT_SUBCATEGORIES,
} from "@/lib/product-options";
import { formatProgramName, normalizeProgramKey } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/produtos/$produtoId")({
  component: ProdutoFormPage,
});

interface Programa {
  id: string;
  nome: string;
}

interface ItemRow {
  id: string;
  nome: string;
  unidade: string;
  categoria: string;
  subcategoria: string | null;
  imagem_url: string | null;
  imagem_path: string | null;
}

function productSupportsImage(nome: string, categorias: string[], programaNames: string[]) {
  const searchable = normalizeProductSearchValue([nome, ...categorias, ...programaNames].join(" "));

  return (
    categorias.includes("Odontológico") ||
    categorias.includes("SESB") ||
    programaNames.some((programa) => ["odontologico", "sesb"].includes(normalizeProgramKey(programa))) ||
    searchable.includes("broca")
  );
}

function ProdutoFormPage() {
  const { produtoId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = produtoId === "novo";

  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState("UNIDADE");
  const [categorias, setCategorias] = useState<string[]>([PRODUCT_CATEGORIES[0]]);
  const [subcategoria, setSubcategoria] = useState<string | null>(null);
  const [selectedProgramas, setSelectedProgramas] = useState<string[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo produto" : "Editar produto"), [isNew]);
  const selectedProgramaNames = useMemo(
    () => selectedProgramas.map((id) => programas.find((programa) => programa.id === id)?.nome || ""),
    [programas, selectedProgramas],
  );
  const imageHint = productSupportsImage(nome, categorias, selectedProgramaNames)
    ? "Aparece para os usuários quando eles forem pedir este produto."
    : "Opcional. A imagem aparece para os usuários na hora do pedido.";
  const availableSubcategories = useMemo(() => {
    const options: string[] = [];

    if (categorias.includes("Gêneros alimentícios/limpeza")) {
      options.push("Alimentício", "Frutas e Verduras", "Limpeza");
    }

    if (categorias.includes("Ambulatorial")) {
      options.push("Material Ambulatorial", "Medicamentos");
    }

    if (categorias.includes("Expediente")) {
      options.push("Expediente");
    }

    return PRODUCT_SUBCATEGORIES.filter((option) => options.includes(option));
  }, [categorias]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: programasData, error: programasError } = await supabase
        .from("programas")
        .select("id,nome")
        .order("nome", { ascending: true });

      if (!active) return;

      if (programasError) {
        setError(programasError.message);
        setLoading(false);
        return;
      }

      setProgramas((programasData ?? []) as Programa[]);

      if (isNew) {
        setLoading(false);
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("itens")
        .select("id,nome,unidade,categoria,subcategoria,imagem_url,imagem_path")
        .eq("id", produtoId)
        .maybeSingle();

      if (!active) return;

      if (itemError) {
        setError(itemError.message);
        setLoading(false);
        return;
      }

      if (!itemData) {
        setError("Produto não encontrado.");
        setLoading(false);
        return;
      }

      const item = itemData as ItemRow;
      setNome(item.nome);
      setUnidade(item.unidade);
      setCategorias(parseProductCategories(item.categoria || PRODUCT_CATEGORIES[0]));
      setSubcategoria(item.subcategoria);
      setImageUrl(item.imagem_url);
      setImagePath(item.imagem_path);
      setImagePreview(item.imagem_url);
      setImageRemoved(false);

      const { data: vinculosData, error: vinculosError } = await supabase
        .from("programa_produtos")
        .select("programa_id")
        .eq("item_id", produtoId);

      if (!active) return;

      if (vinculosError) {
        setError(vinculosError.message);
      } else {
        setSelectedProgramas((vinculosData ?? []).map((v) => v.programa_id));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [isNew, produtoId]);

  const togglePrograma = (programaId: string) => {
    setSelectedProgramas((current) =>
      current.includes(programaId)
        ? current.filter((id) => id !== programaId)
        : [...current, programaId],
    );
  };

  const toggleCategoria = (nextCategoria: string) => {
    setCategorias((current) =>
      current.includes(nextCategoria)
        ? current.filter((categoria) => categoria !== nextCategoria)
        : [...current, nextCategoria],
    );
  };

  useEffect(() => {
    if (!availableSubcategories.length) {
      setSubcategoria(null);
      return;
    }

    if (subcategoria && availableSubcategories.includes(subcategoria)) {
      return;
    }

    setSubcategoria(availableSubcategories[0]);
  }, [availableSubcategories, subcategoria]);

  const handleImageChange = (file: File | null) => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);

    setImageFile(file);
    setImageRemoved(false);
    setImagePreview(file ? URL.createObjectURL(file) : imageUrl);
  };

  const handleRemoveImage = () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);

    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setImagePath(null);
    setImageRemoved(true);
  };

  const saveProductImage = async (itemId: string) => {
    if (imageRemoved && !imageFile) {
      return { imagem_url: null, imagem_path: null };
    }

    if (!imageFile) {
      return null;
    }

    if (imagePath) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([imagePath]);
    }

    const safeName = sanitizeFileName(imageFile.name) || "imagem-produto";
    const storagePath = `${itemId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, imageFile, {
        contentType: imageFile.type || "image/jpeg",
        upsert: true,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
    return { imagem_url: data.publicUrl, imagem_path: storagePath };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const nomeLimpo = nome.trim();
    const unidadeLimpa = unidade.trim() || "UNIDADE";

    if (!nomeLimpo) {
      setError("Informe o nome do produto.");
      setSaving(false);
      return;
    }

    if (categorias.length === 0) {
      setError("Selecione pelo menos um tipo de material.");
      setSaving(false);
      return;
    }

    const payload = {
      nome: nomeLimpo,
      unidade: unidadeLimpa,
      categoria: formatProductCategories(categorias),
      subcategoria,
    };

    const itemResult = isNew
      ? await supabase.from("itens").insert(payload).select("id").single()
      : await supabase.from("itens").update(payload).eq("id", produtoId).select("id").single();

    if (itemResult.error) {
      setError(itemResult.error.message);
      setSaving(false);
      return;
    }

    const itemId = itemResult.data.id;

    try {
      const imagePayload = await saveProductImage(itemId);
      if (imagePayload) {
        const imageUpdate = await supabase.from("itens").update(imagePayload).eq("id", itemId);
        if (imageUpdate.error) throw new Error(imageUpdate.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar imagem do produto.");
      setSaving(false);
      return;
    }

    const deleteResult = await supabase.from("programa_produtos").delete().eq("item_id", itemId);

    if (deleteResult.error) {
      setError(deleteResult.error.message);
      setSaving(false);
      return;
    }

    if (selectedProgramas.length > 0) {
      const insertResult = await supabase.from("programa_produtos").insert(
        selectedProgramas.map((programaId) => ({
          item_id: itemId,
          programa_id: programaId,
        })),
      );

      if (insertResult.error) {
        setError(insertResult.error.message);
        setSaving(false);
        return;
      }
    }

    setSuccess("Produto salvo.");
    setSaving(false);
    navigate({ to: "/admin/cadastros/produtos" });
  };

  const handleDelete = async () => {
    if (isNew) return;

    setDeleting(true);
    setError(null);
    setSuccess(null);

    const deleteLinksResult = await supabase
      .from("programa_produtos")
      .delete()
      .eq("item_id", produtoId);

    if (deleteLinksResult.error) {
      setError(deleteLinksResult.error.message);
      setDeleting(false);
      return;
    }

    if (imagePath) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([imagePath]);
    }

    const deleteItemResult = await supabase
      .from("itens")
      .delete()
      .eq("id", produtoId);

    if (deleteItemResult.error) {
      setError(deleteItemResult.error.message);
      setDeleting(false);
      return;
    }

    setDeleteOpen(false);
    setDeleting(false);
    navigate({ to: "/admin/cadastros/produtos" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Produtos</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => navigate({ to: "/admin/cadastros/produtos" })}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <Card className="p-6">
        {loading ? (
          <div className="flex h-32 items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <form className="max-w-2xl space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome do produto"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unidade">Unidade</Label>
                <Input
                  id="unidade"
                  value={unidade}
                  onChange={(event) => setUnidade(event.target.value)}
                  placeholder="UNIDADE"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <div>
                <Label htmlFor="imagem-produto">Imagem do produto</Label>
                <p className="text-sm text-muted-foreground">{imageHint}</p>
              </div>

              {imagePreview ? (
                <div className="flex flex-wrap items-center gap-3">
                  <img
                    src={imagePreview}
                    alt={nome || "Imagem do produto"}
                    className="h-24 w-24 rounded-md border object-cover"
                  />
                  <Button type="button" variant="outline" className="gap-2" onClick={handleRemoveImage}>
                    <X className="h-4 w-4" />
                    Remover imagem
                  </Button>
                </div>
              ) : null}

              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                <ImagePlus className="h-4 w-4" />
                Selecionar imagem
                <input
                  id="imagem-produto"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Tipos de material</Label>
                <p className="text-sm text-muted-foreground">
                  Marque todos os tipos onde este produto deve aparecer.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRODUCT_CATEGORIES.map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={categorias.includes(option)}
                      onCheckedChange={() => toggleCategoria(option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subcategoria">Subcategoria</Label>
              <Select
                value={subcategoria ?? "sem-subcategoria"}
                onValueChange={(value) =>
                  setSubcategoria(value === "sem-subcategoria" ? null : value)
                }
              >
                <SelectTrigger id="subcategoria">
                  <SelectValue placeholder="Selecione a subcategoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem-subcategoria">Sem subcategoria</SelectItem>
                  {availableSubcategories.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Use a subcategoria para separar itens como alimentício, frutas e verduras, limpeza, material ambulatorial e medicamentos.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Programas onde vai aparecer</Label>
                <p className="text-sm text-muted-foreground">
                  Marque os programas que podem pedir este produto. Sem marcar, ele fica liberado
                  para todos.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {programas.map((programa) => (
                  <label
                    key={programa.id}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={selectedProgramas.includes(programa.id)}
                      onCheckedChange={() => togglePrograma(programa.id)}
                    />
                    <span>{formatProgramName(programa.nome)}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-primary">{success}</p>}

            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
            {!isNew && (
              <Button
                type="button"
                variant="destructive"
                className="ml-2 gap-2"
                disabled={saving || deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Excluir produto
              </Button>
            )}
          </form>
        )}
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir produto</DialogTitle>
            <DialogDescription>
              Esta ação vai remover o produto cadastrado e seus vínculos com programas.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Confirma a exclusão de <span className="font-medium text-foreground">{nome || "este produto"}</span>?
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}