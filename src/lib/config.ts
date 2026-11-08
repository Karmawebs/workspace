export const PROJECT_REF = "wrkoskqfjuefgrwhymqu";
export function readConfig(env: Record<string, string | undefined>, localDevelopment = false) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const loopback = localDevelopment && url === "http://127.0.0.1:54321";
  if (!loopback && url !== `https://${PROJECT_REF}.supabase.co`)
    throw new Error(
      "Configura VITE_SUPABASE_URL con el backend autorizado antes de compilar Workspace.",
    );
  if (!key?.startsWith("sb_publishable_"))
    throw new Error(
      "Configura VITE_SUPABASE_PUBLISHABLE_KEY con una clave pública sb_publishable_ antes de compilar Workspace.",
    );
  return { url, key };
}
