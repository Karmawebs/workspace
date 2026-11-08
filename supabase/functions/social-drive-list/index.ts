// Karma Social — Drive browser (server-side only).
// Required Supabase function secrets: GOOGLE_OAUTH_CLIENT_ID,
// GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.
// This is a single Karma-owned Google account adapter. Interactive OAuth
// onboarding and per-connection credentials are NOT implemented here.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": Deno.env.get("WORKSPACE_ORIGIN") ?? "https://work.karmawebs.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{10,255}$/.test(value);
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function googleAccessToken(): Promise<string> {
  const client_id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const client_secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const refresh_token = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!client_id || !client_secret || !refresh_token) throw new Error("GOOGLE_NOT_CONFIGURED");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error("GOOGLE_REAUTH_REQUIRED");
  const data = await response.json();
  if (typeof data.access_token !== "string") throw new Error("GOOGLE_REAUTH_REQUIRED");
  return data.access_token;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "UNAUTHORIZED" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return json({ error: "SERVER_NOT_CONFIGURED" }, 503);
    const db = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: "UNAUTHORIZED" }, 401);
    const body = await req.json();
    if (!uuid(body.projectId)) return json({ error: "INVALID_PROJECT" }, 400);
    if (body.folderId != null && !validId(body.folderId)) return json({ error: "INVALID_FOLDER" }, 400);
    if (body.pageToken != null && (typeof body.pageToken !== "string" || body.pageToken.length > 2048))
      return json({ error: "INVALID_PAGE_TOKEN" }, 400);

    // Check staff membership explicitly, never rely on a client-provided workspace ID.
    const { data: project, error: projectError } = await db
      .from("kw_projects").select("id,workspace_id,app_key")
      .eq("id", body.projectId).eq("app_key", "social").single();
    if (projectError || !project) return json({ error: "PROJECT_NOT_FOUND" }, 404);
    const { data: membership } = await db.from("kw_workspace_members")
      .select("user_id").eq("workspace_id", project.workspace_id).eq("user_id", auth.user.id).maybeSingle();
    if (!membership) return json({ error: "FORBIDDEN" }, 403);

    const { data: folder, error: folderError } = await db.from("kw_social_drive_folders")
      .select("drive_folder_id").eq("project_id", project.id).eq("workspace_id", project.workspace_id).single();
    if (folderError || !folder) return json({ error: "FOLDER_NOT_CONNECTED" }, 409);
    const rootId = folder.drive_folder_id;
    const requestedId = body.folderId ?? rootId;
    const token = await googleAccessToken();
    const googleHeaders = { Authorization: `Bearer ${token}` };

    // Never browse an arbitrary folder: verify its parent chain reaches the configured root.
    if (requestedId !== rootId) {
      let cursor = requestedId;
      const visited = new Set<string>();
      let found = false;
      for (let i = 0; i < 30; i++) {
        if (visited.has(cursor)) break;
        visited.add(cursor);
        const meta = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cursor)}?fields=id,parents,mimeType&supportsAllDrives=true`,
          { headers: googleHeaders },
        );
        if (!meta.ok) return json({ error: "GOOGLE_FOLDER_UNAVAILABLE" }, 502);
        const info = await meta.json();
        if (info.mimeType !== "application/vnd.google-apps.folder") return json({ error: "NOT_A_FOLDER" }, 400);
        const parents: string[] = Array.isArray(info.parents) ? info.parents : [];
        if (parents.includes(rootId)) { found = true; break; }
        if (parents.length !== 1 || !validId(parents[0])) break;
        cursor = parents[0];
      }
      if (!found) return json({ error: "FOLDER_OUTSIDE_PROJECT" }, 403);
    }

    const params = new URLSearchParams({
      q: `'${requestedId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink)",
      pageSize: "100",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (body.pageToken) params.set("pageToken", body.pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: googleHeaders });
    if (!response.ok) return json({ error: "GOOGLE_LIST_FAILED" }, 502);
    const data = await response.json();
    return json({
      folderId: requestedId,
      files: Array.isArray(data.files) ? data.files.filter((f: { mimeType?: string }) =>
        f.mimeType === "application/vnd.google-apps.folder" ||
        ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(f.mimeType || "")) : [],
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "GOOGLE_NOT_CONFIGURED") return json({ error: code }, 503);
    if (code === "GOOGLE_REAUTH_REQUIRED") return json({ error: code }, 502);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});
