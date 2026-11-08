// Download a project-scoped Drive image for importing through the existing
// Social upload pipeline. Limit intentionally conservative for Edge Functions.
// Do not use for video; large assets require server-side streaming jobs.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("WORKSPACE_ORIGIN") ?? "https://work.karmawebs.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (error: string, status: number) => new Response(JSON.stringify({ error }), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const idOk = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{10,255}$/.test(v);
const uuidOk = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply("METHOD_NOT_ALLOWED", 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply("UNAUTHORIZED", 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return reply("NOT_CONFIGURED", 503);
    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return reply("UNAUTHORIZED", 401);
    const body = await req.json();
    if (!uuidOk(body.projectId) || !idOk(body.fileId)) return reply("INVALID_INPUT", 400);
    const { data: project } = await db.from("kw_projects").select("id,workspace_id")
      .eq("id", body.projectId).eq("app_key", "social").maybeSingle();
    if (!project) return reply("PROJECT_NOT_FOUND", 404);
    const { data: member } = await db.from("kw_workspace_members").select("user_id")
      .eq("workspace_id", project.workspace_id).eq("user_id", auth.user.id).maybeSingle();
    if (!member) return reply("FORBIDDEN", 403);
    const { data: folder } = await db.from("kw_social_drive_folders").select("drive_folder_id")
      .eq("workspace_id", project.workspace_id).eq("project_id", project.id).maybeSingle();
    if (!folder) return reply("FOLDER_NOT_CONNECTED", 409);
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const refresh = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
    if (!clientId || !secret || !refresh) return reply("GOOGLE_NOT_CONFIGURED", 503);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret,
        refresh_token: refresh, grant_type: "refresh_token" }),
    });
    if (!tokenResponse.ok) return reply("GOOGLE_REAUTH_REQUIRED", 502);
    const token = (await tokenResponse.json()).access_token;
    if (typeof token !== "string") return reply("GOOGLE_REAUTH_REQUIRED", 502);
    const headers = { Authorization: `Bearer ${token}` };
    let cursor = body.fileId;
    let info: { id: string; name: string; mimeType: string; size?: string; parents?: string[] } | undefined;
    let inside = false;
    const visited = new Set<string>();
    for (let depth = 0; depth < 30; depth++) {
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const metadata = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cursor)}?fields=id,name,mimeType,size,parents&supportsAllDrives=true`, { headers });
      if (!metadata.ok) return reply("GOOGLE_FILE_UNAVAILABLE", 502);
      const current = await metadata.json();
      if (!info) info = current;
      if (current.parents?.includes(folder.drive_folder_id)) { inside = true; break; }
      if (!Array.isArray(current.parents) || current.parents.length !== 1 || !idOk(current.parents[0])) break;
      cursor = current.parents[0];
    }
    if (!inside || !info) return reply("FILE_OUTSIDE_PROJECT", 403);
    if (!["image/jpeg", "image/png", "image/webp"].includes(info.mimeType)) return reply("UNSUPPORTED_FORMAT", 415);
    if (!info.size || !Number.isSafeInteger(Number(info.size)) || Number(info.size) > 10 * 1024 * 1024)
      return reply("FILE_TOO_LARGE", 413);
    const file = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?alt=media&supportsAllDrives=true`, { headers });
    if (!file.ok) return reply("GOOGLE_DOWNLOAD_FAILED", 502);
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== Number(info.size) || bytes.byteLength > 10 * 1024 * 1024)
      return reply("FILE_SIZE_MISMATCH", 502);
    const safeName = info.name.replace(/[\r\n"\\]/g, "_").slice(0, 180);
    return new Response(bytes, { headers: {
      ...cors, "Content-Type": info.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-File-Name": encodeURIComponent(info.name),
      "Cache-Control": "no-store",
    } });
  } catch {
    return reply("INTERNAL_ERROR", 500);
  }
});
