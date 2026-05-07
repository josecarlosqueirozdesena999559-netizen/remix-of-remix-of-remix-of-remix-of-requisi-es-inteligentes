import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { normalizeProductCategory, PRODUCT_CATEGORIES } from "@/lib/product-options";

export const Route = createFileRoute("/admin/cadastros/usuarios/$usuarioId")({
  component: UsuarioFormPage,
});

interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  funcao: string | null;
  setor: string | null;
  unidade_nome: string | null;
  categorias_permitidas: unknown;
}

interface LocalRow {
  id: number;
  nome: string;
  programa: string | null;
}

interface ProgramaRow {
  id: string;
  nome: string;
}

const EMPTY_SELECT_VALUE = "__none__";

function UsuarioFormPage() {
  const { usuarioId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = usuarioId === "novo";

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [funcao, setFuncao] = useState("");
  const [setor, setSetor] = useState("");
  const [unidadeNome, setUnidadeNome] = useState("");
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [programas, setProgramas] = useState<ProgramaRow[]>([]);
  const [categoriasPermitidas, setCategoriasPermitidas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (isNew ? "Novo usuário" : "Editar usuário"), [isNew]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      const [locaisResult, programasResult, usuarioResult] = await Promise.all([
        supabase.from("setores").select("id,nome,programa").order("nome", { ascending: true }),
        supabase.from("programas").select("id,nome").order("nome", { ascending: true }),
        isNew
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from("usuarios")
              .select("id,nome,email,cpf,funcao,setor,unidade_nome,categorias_permitidas")
              .eq("id", usuarioId)
              .maybeSingle(),
      ]);

      if (!active) return;

      if (locaisResult.error || programasResult.error) {
        setError(
          locaisResult.error?.message ||
            programasResult.error?.message ||
            "Erro ao carregar locais e programas.",
        );
        setLoading(false);
        return;
      }

      setLocais((locaisResult.data ?? []) as LocalRow[]);
      setProgramas((programasResult.data ?? []) as ProgramaRow[]);

      if (isNew) {
        setLoading(false);
        return;
      }

      const { data, error } = usuarioResult;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Usuário não encontrado.");
        setLoading(false);
        return;
      }

      const usuario = data as UsuarioRow;
      setNome(usuario.nome);
      setEmail(usuario.email);
      setCpf(usuario.cpf ?? "");
      setFuncao(usuario.funcao ?? "");
      setSetor(usuario.setor ?? "");
      setUnidadeNome(usuario.unidade_nome ?? "");
      setCategoriasPermitidas(
        Array.isArray(usuario.categorias_permitidas)
          ? usuario.categorias_permitidas.map(String).map(normalizeProductCategory)
          : [],
      );
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [isNew, usuarioId]);

  const toggleCategoria = (categoria: string) => {
    setCategoriasPermitidas((current) =>
      current.includes(categoria)
        ? current.filter((item) => item !== categoria)
        : [...current, categoria],
    );
  };

  const handleLocalChange = (value: string) => {
    const nextLocal = value === EMPTY_SELECT_VALUE ? "" : value;
    setUnidadeNome(nextLocal);

    const local = locais.find((item) => item.nome === nextLocal);
    if (local?.programa) {
      setSetor(local.programa);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();

    if (!nomeLimpo || !emailLimpo) {
      setError("Informe nome e e-mail.");
      setSaving(false);
      return;
    }

    const payload = {
      nome: nomeLimpo,
      email: emailLimpo,
      cpf: cpf.trim() || null,
      funcao: funcao.trim() || null,
      setor: setor.trim() || null,
      unidade_nome: unidadeNome.trim() || null,
      categorias_permitidas: categoriasPermitidas,
    };

    const result = isNew
      ? await supabase.from("usuarios").insert(payload).select("id").single()
      : await supabase.from("usuarios").update(payload).eq("id", usuarioId).select("id").single();

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate({ to: "/admin/cadastros/usuarios" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Usuários</p>
          <h2 className="text-2xl text-foreground">{title}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => navigate({ to: "/admin/cadastros/usuarios" })}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  placeholder="Nome do usuário"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@exemplo.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  placeholder="CPF"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidade">Local</Label>
                <Select value={unidadeNome || EMPTY_SELECT_VALUE} onValueChange={handleLocalChange}>
                  <SelectTrigger id="unidade">
                    <SelectValue placeholder="Selecione o local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sem local</SelectItem>
                    {locais.map((local) => (
                      <SelectItem key={local.id} value={local.nome}>
                        {local.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="setor">Programa</Label>
                <Select
                  value={setor || EMPTY_SELECT_VALUE}
                  onValueChange={(value) => setSetor(value === EMPTY_SELECT_VALUE ? "" : value)}
                >
                  <SelectTrigger id="setor">
                    <SelectValue placeholder="Selecione o programa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sem programa</SelectItem>
                    {programas.map((programa) => (
                      <SelectItem key={programa.id} value={programa.nome}>
                        {programa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="funcao">Função</Label>
                <Input
                  id="funcao"
                  value={funcao}
                  onChange={(event) => setFuncao(event.target.value)}
                  placeholder="Função"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Tipos que este usuário pode pedir</Label>
                <p className="text-sm text-muted-foreground">
                  Os itens carregam quando o tipo do produto estiver liberado aqui.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {PRODUCT_CATEGORIES.map((categoria) => (
                  <label
                    key={categoria}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <Checkbox
                      checked={categoriasPermitidas.includes(categoria)}
                      onCheckedChange={() => toggleCategoria(categoria)}
                    />
                    <span>{categoria}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
