import { createClient } from "npm:@supabase/supabase-js@2.118.0";

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error("CONFIGURATION");
  return value;
}
export const cors = {
  "Access-Control-Allow-Origin":
    Deno.env.get("WORKSPACE_ORIGIN") ?? "https://workspace.karmawebs.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}
export class Failure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function failure(e: unknown) {
  return e instanceof Failure
    ? json({ error: e.message }, e.status)
    : json({ error: "DRIVE_UNAVAILABLE" }, 502);
}
export const admin = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
export async function scope(req: Request, projectId: string) {
  const jwt = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!jwt) throw new Failure("UNAUTHORIZED", 401);
  const db = admin();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(jwt);
  if (error || !user) throw new Failure("UNAUTHORIZED", 401);
  const session = JSON.parse(
    atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  ).session_id;
  if (!session) throw new Failure("UNAUTHORIZED", 401);
  const { data: project } = await db
    .from("kw_projects")
    .select("workspace_id")
    .eq("id", projectId)
    .eq("app_key", "social")
    .maybeSingle();
  if (!project) throw new Failure("PROJECT_UNAVAILABLE", 403);
  const workspace = project.workspace_id;
  const { data: member } = await db
    .from("kw_workspace_members")
    .select("role")
    .eq("workspace_id", workspace)
    .eq("user_id", user.id)
    .maybeSingle();
  // Core permits ordinary members to edit project assignments. Those rows
  // cannot authorize access to a private Google account.
  if (!["owner", "admin"].includes(member?.role))
    throw new Failure("FORBIDDEN", 403);
  return { db, workspace, projectId, user: user.id, session };
}
export type Scope = Awaited<ReturnType<typeof scope>>;
export const b64 = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const bytes = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
async function key() {
  const raw = bytes(env("SOCIAL_DRIVE_ENCRYPTION_KEY"));
  if (raw.length !== 32) throw new Error("CONFIGURATION");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function seal(token: string, project: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(project) },
    await key(),
    new TextEncoder().encode(token),
  );
  return b64(iv) + "." + b64(new Uint8Array(ciphertext));
}
export async function exchange(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      ...params,
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    }),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Failure(
      data.error === "invalid_grant"
        ? "GOOGLE_REAUTH_REQUIRED"
        : "GOOGLE_UNAVAILABLE",
      data.error === "invalid_grant" ? 409 : 502,
    );
  return data;
}
export async function connection(s: Scope) {
  const { data, error } = await s.db
    .from("kw_social_drive_connections")
    .select("id")
    .eq("project_id", s.projectId)
    .eq("workspace_id", s.workspace)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Failure("FOLDER_NOT_CONNECTED", 409);
  return data.id as string;
}
export async function access(s: Scope, id: string, ownerOnly = false) {
  const { data } = await s.db
    .from("kw_social_drive_credentials")
    .select("owner_id,sealed_token")
    .eq("connection_id", id)
    .single();
  if (!data || (ownerOnly && data.owner_id !== s.user))
    throw new Failure("FORBIDDEN", 403);
  const [iv, encrypted] = data.sealed_token.split(".");
  const raw = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytes(iv),
      additionalData: new TextEncoder().encode(s.projectId),
    },
    await key(),
    bytes(encrypted),
  );
  const token = await exchange({
    grant_type: "refresh_token",
    refresh_token: new TextDecoder().decode(raw),
  });
  if (!token.access_token) throw new Failure("GOOGLE_REAUTH_REQUIRED", 409);
  return token.access_token as string;
}
