import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

function loadServerEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), ["SUPABASE_", "WHATSAPP_"]);

  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value;
  }
}

export default defineConfig(({ mode }) => {
  loadServerEnv(mode);

  return {
    server: {
      allowedHosts: true,
    },
    plugins: [
      tsConfigPaths(),
      tailwindcss(),
      tanstackStart({
        server: { entry: "server" },
      }),
      nitro(),
      react(),
    ],
  };
});
