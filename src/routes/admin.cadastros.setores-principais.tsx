import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Folder, FolderTree, MapPin, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useSupabaseList } from "@/hooks/useSupabaseList";
import { formatProgramName } from "@/lib/program-options";

export const Route = createFileRoute("/admin/cadastros/setores-principais")({
  component: SetoresPrincipaisPage,
});

interface Setor {
  id: number;
  nome: string;
  programa: string | null;
  setor_programas?: {
    programas: {
      id: string;
      nome: string;
    } | null;
  }[];
}

interface FolderItem {
  id: string;
  label: string;
  subtitle: string;
  kind: "principal" | "odontologia";
  setorId?: number;
}

interface SectorGroup {
  id: string;
  nome: string;
  programa: string;
  folders: FolderItem[];
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isOdontologiaSetor(nome: string) {
  return normalizeText(nome).includes("ODONTO");
}

function isSingleFolderSetor(nome: string) {
  const normalized = normalizeText(nome);
  return normalized.includes("SECRETARIA DE SAUDE") || normalized.includes("SAMU");
}

function getProgramLabel(setor: Setor) {
  const linkedProgramas =
    setor.setor_programas?.map((item) => item.programas?.nome).filter(Boolean) ?? [];

  if (linkedProgramas.length > 0) {
    return linkedProgramas.map((programa) => formatProgramName(programa)).join(", ");
  }

  return formatProgramName(setor.programa) || "Sem programa vinculado";
}

function buildSectorGroups(setores: Setor[] | undefined): SectorGroup[] {
  return (setores ?? [])
    .filter((setor) => setor.nome && !isOdontologiaSetor(setor.nome))
    .map((setor) => {
      const singleFolder = isSingleFolderSetor(setor.nome);
      const folders: FolderItem[] = [
        {
          id: `${setor.id}-principal`,
          label: setor.nome,
          subtitle: singleFolder ? "Setor principal" : "Posto principal",
          kind: "principal",
          setorId: setor.id,
        },
      ];

      if (!singleFolder) {
        folders.push({
          id: `${setor.id}-odontologia`,
          label: "Odontologia",
          subtitle: setor.nome,
          kind: "odontologia",
        });
      }

      return {
        id: String(setor.id),
        nome: setor.nome,
        programa: getProgramLabel(setor),
        folders,
      };
    });
}

function SetoresPrincipaisPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useSupabaseList<Setor>(
    "setores",
    "id,nome,programa,created_at,setor_programas(programas(id,nome))",
    { column: "nome", ascending: true },
    ["setores", "setor_programas", "programas"],
  );
  const groups = buildSectorGroups(data);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cadastros / Setores principais</p>
          <h2 className="text-2xl text-foreground">Setores Principais</h2>
        </div>
        <Badge variant="outline" className="gap-2 rounded-md px-3 py-2 text-sm">
          <FolderTree className="h-4 w-4 text-primary" />
          {groups.reduce((total, group) => total + group.folders.length, 0)} pastas
        </Badge>
      </div>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando setores principais...</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">{error}</Card>
      ) : groups.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum setor cadastrado.</Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{group.nome}</h3>
                  <p className="text-xs text-muted-foreground">{group.programa}</p>
                </div>
                <Badge variant="outline" className="rounded-md text-xs">
                  {group.folders.length} {group.folders.length === 1 ? "pasta" : "pastas"}
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.folders.map((folder) => {
                  const isPrincipal = folder.kind === "principal";
                  const Icon = isPrincipal ? Folder : Stethoscope;

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        if (!folder.setorId) return;
                        navigate({
                          to: "/admin/cadastros/locais/$localId",
                          params: { localId: String(folder.setorId) },
                        });
                      }}
                      className="flex min-h-28 items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{folder.label}</span>
                        <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{folder.subtitle}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}