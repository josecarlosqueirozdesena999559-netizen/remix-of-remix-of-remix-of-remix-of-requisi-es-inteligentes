import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

const STALE_CHUNK_RELOAD_KEY = "almoxarifado:stale-chunk-reload";
const STALE_CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "error loading dynamically imported module",
  "loading chunk",
  "chunkloaderror",
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function isStaleChunkError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return STALE_CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function clearBrowserCaches() {
  if (typeof window === "undefined") return;

  if ("caches" in window) {
    const keys = await window.caches.keys();
    await Promise.all(keys.map((key) => window.caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

function reloadWithCacheBust() {
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
}

function reloadOnceForFreshAssets() {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const previousReload = Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
  if (now - previousReload < 10_000) return false;

  window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  void clearBrowserCaches().finally(reloadWithCacheBust);
  return true;
}

function useReloadOnStaleChunks() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isStaleChunkError(event.error) || isStaleChunkError(event.message)) {
        reloadOnceForFreshAssets();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isStaleChunkError(event.reason)) {
        reloadOnceForFreshAssets();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const staleChunkError = isStaleChunkError(error);

  useEffect(() => {
    if (staleChunkError) {
      reloadOnceForFreshAssets();
    }
  }, [staleChunkError]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {staleChunkError ? "Atualizando o sistema" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staleChunkError
            ? "Uma nova versao foi publicada. Estamos limpando os arquivos antigos e recarregando o sistema."
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (staleChunkError) {
                void clearBrowserCaches().finally(reloadWithCacheBust);
                return;
              }

              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recarregar agora
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Almoxarifado" },
      { name: "description", content: "Sistema de requisições do almoxarifado" },
      { name: "author", content: "Almoxarifado" },
      { property: "og:title", content: "Almoxarifado" },
      { property: "og:description", content: "Sistema de requisições do almoxarifado" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon.png",
      },
      {
        rel: "apple-touch-icon",
        href: "/favicon.png",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useReloadOnStaleChunks();
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
