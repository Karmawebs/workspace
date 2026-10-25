import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readConfig } from "./src/lib/config.ts";

export default defineConfig(async ({ command, mode }) => {
  const config = readConfig(loadEnv(mode, process.cwd(), "VITE_"));
  if (command === "build") {
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`Supabase rechazó la configuración pública del build (${response.status}). Revisa las variables de build de Cloudflare.`);
  }
  return { plugins: [react()] };
});
