export const PROJECT_REF = "wrkoskqfjuefgrwhymqu";
export function readConfig(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url !== `https://${PROJECT_REF}.supabase.co`)
    throw new Error(
      "Configura el backend autorizado de Karma Workspace en .env.local.",
    );
  if (!key?.startsWith("sb_publishable_"))
    throw new Error(
      "Configura una clave pública sb_publishable_ en .env.local.",
    );
  return { url, key };
}
