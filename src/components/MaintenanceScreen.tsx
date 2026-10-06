import {
  ClipboardList,
  Clock3,
  Database,
  FileText,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const improvementAreas = [
  {
    icon: Database,
    title: "Banco de dados",
    description:
      "Correções e melhorias para deixar as informações mais consistentes e o sistema mais estável.",
  },
  {
    icon: FileText,
    title: "PDFs e documentos",
    description: "Ajustes nos documentos para facilitar a leitura, a visualização e a impressão.",
  },
  {
    icon: ClipboardList,
    title: "Cadastros",
    description: "Formulários mais claros e informações mais simples de consultar e atualizar.",
  },
  {
    icon: UsersRound,
    title: "Login e acesso",
    description:
      "Um fluxo de entrada mais fácil de entender, com melhorias para todos os usuários.",
  },
];

export function MaintenanceScreen() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-36 -top-40 h-[26rem] w-[26rem] rounded-full bg-emerald-100/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -left-36 h-[28rem] w-[28rem] rounded-full bg-emerald-50 blur-3xl"
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5 sm:px-8 sm:py-7 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <ClipboardList className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-foreground">Almoxarifado</p>
              <p className="text-xs text-muted-foreground">Sistema de solicitações</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-3.5 py-2 text-xs font-semibold text-emerald-800 shadow-sm">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
            </span>
            Melhorias em andamento
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(27rem,0.95fr)] lg:gap-16 lg:py-16">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200/70">
              <Wrench className="size-3.5" aria-hidden="true" />
              Estamos preparando uma experiência melhor
            </div>

            <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
              Uma pausa agora para deixar tudo mais simples.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Estamos realizando melhorias e correções no sistema para tornar o uso mais fácil,
              estável e prático.{" "}
              <span className="font-semibold text-foreground">Voltamos em breve.</span>
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                type="button"
                onClick={() => window.location.reload()}
                className="h-11 gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Recarregar página
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="size-4 text-emerald-700" aria-hidden="true" />
                Tente novamente daqui a pouco
              </div>
            </div>

            <div className="mt-10 flex max-w-xl items-start gap-3 border-t border-border/80 pt-6">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Estamos cuidando dos detalhes para que as próximas solicitações sejam mais fáceis de
                acompanhar do começo ao fim.
              </p>
            </div>
          </div>

          <section
            aria-labelledby="improvements-title"
            className="relative rounded-[1.75rem] border border-border/80 bg-white/90 p-5 shadow-xl shadow-emerald-950/[0.04] backdrop-blur-sm sm:p-7"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  O que estamos melhorando
                </p>
                <h2
                  id="improvements-title"
                  className="mt-2 text-xl font-semibold tracking-tight text-foreground"
                >
                  Mais clareza em cada etapa
                </h2>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100">
                <Wrench className="size-5" aria-hidden="true" />
              </div>
            </div>

            <div className="mb-5 flex justify-center rounded-2xl bg-emerald-50/50 py-1">
              <img
                src="/maintenance-illustration.png"
                alt="Ilustração de manutenção com engrenagem, cone de sinalização e chave inglesa"
                width={205}
                height={115}
                className="h-[115px] w-[205px] object-contain"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {improvementAreas.map(({ icon: Icon, title, description }, index) => (
                <article
                  key={title}
                  className="rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-xs ring-1 ring-border/70">
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-muted-foreground/70">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>
                </article>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50/80 px-4 py-3.5 ring-1 ring-inset ring-emerald-100">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-xs">
                <Clock3 className="size-4" aria-hidden="true" />
              </div>
              <p className="text-xs leading-5 text-emerald-950/80">
                Obrigado pela compreensão. Em breve, o sistema estará disponível novamente.
              </p>
            </div>
          </section>
        </section>

        <footer className="relative flex flex-col gap-1 border-t border-border/70 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Almoxarifado · Sistema de solicitações</span>
          <span>Obrigado pela paciência e pela confiança.</span>
        </footer>
      </main>
    </div>
  );
}
