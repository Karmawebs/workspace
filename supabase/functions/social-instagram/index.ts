import { cors, env, Failure, json, scope } from "../_shared/social-drive.ts";
import {
  sealPlatformTokens,
  openPlatformTokens,
} from "../_shared/social-platform-credentials.ts";
import { configId, exchange, identity, loginURL } from "./meta.ts";
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
async function key() {
  const bytes = Uint8Array.from(atob(env("SOCIAL_PLATFORM_KEY_V1")), (c) =>
    c.charCodeAt(0),
  );
  if (bytes.length !== 32) throw new Error("CONFIGURATION");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const b = await req.json();
    if (!uuid(b.projectId)) throw new Failure("INVALID_PROJECT", 400);
    const s = await scope(req, b.projectId);
    const ctx = {
      p_project: s.projectId,
      p_workspace: s.workspace,
      p_user: s.user,
    };
    if (b.action === "disconnect") {
      if (!uuid(b.connectionId)) throw new Failure("INVALID_ACCOUNT", 400);
      const { error } = await s.db.rpc("kw_disconnect_instagram", {
        ...ctx,
        p_id: b.connectionId,
      });
      if (error) throw new Failure("INVALID_ACCOUNT", 409);
      return json({ disconnected: true });
    }
    const secret = env("META_APP_SECRET"),
      encryptionKey = await key();
    if (b.action === "start") {
      const state = crypto.randomUUID();
      const { error } = await s.db
        .from("kw_instagram_authorizations")
        .upsert({
          project_id: s.projectId,
          user_id: s.user,
          session_id: s.session,
          state,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          claimed: false,
        });
      if (error) throw error;
      return json({ url: loginURL(state), state });
    }
    if (b.action === "check") {
      const { data: account } = await s.db
        .from("kw_social_platform_connections")
        .select("id,external_account_id,connected_at")
        .eq("project_id", s.projectId)
        .eq("workspace_id", s.workspace)
        .eq("platform", "instagram")
        .eq("id", b.connectionId)
        .maybeSingle();
      if (!account) throw new Failure("INVALID_ACCOUNT", 404);
      const { data: record, error } = await s.db
        .from("kw_social_platform_credentials")
        .select("ciphertext,key_version")
        .eq("connection_id", account.id)
        .single();
      if (error || record.key_version !== 1) throw new Error("CREDENTIAL");
      let status = "connected",
        expires_at;
      try {
        const tokens = await openPlatformTokens(
          account.id,
          record,
          encryptionKey,
        );
        const ig = await identity(tokens.accessToken, secret);
        if (ig.external !== account.external_account_id)
          throw new Failure("REAUTHORIZE", 409);
        expires_at = ig.expires;
      } catch (e) {
        if (
          !(e instanceof Failure) ||
          ![
            "REAUTHORIZE",
            "INCOMPLETE_CONSENT",
            "SELECT_ONE_ACCOUNT",
            "UNEXPECTED_PERMISSIONS",
          ].includes(e.message)
        )
          throw e;
        status = "reauthorization_required";
      }
      const result = await s.db
        .from("kw_social_platform_connections")
        .update({ status, expires_at })
        .eq("id", account.id)
        .eq("connected_at", account.connected_at);
      if (result.error) throw result.error;
      return json({ status });
    }
    if (
      b.action !== "finish" ||
      !uuid(b.state) ||
      typeof b.code !== "string" ||
      !b.code ||
      b.code.length > 8192
    )
      throw new Failure("INVALID_CALLBACK", 400);
    const claim = await s.db
      .from("kw_instagram_authorizations")
      .update({ claimed: true })
      .eq("project_id", s.projectId)
      .eq("user_id", s.user)
      .eq("session_id", s.session)
      .eq("state", b.state)
      .eq("claimed", false)
      .gt("expires_at", new Date().toISOString())
      .select("project_id")
      .maybeSingle();
    if (claim.error || !claim.data) throw new Failure("INVALID_CALLBACK", 400);
    const token = await exchange(b.code, secret),
      ig = await identity(token, secret);
    const existing = await s.db
      .from("kw_social_platform_connections")
      .select("id")
      .eq("project_id", s.projectId)
      .eq("workspace_id", s.workspace)
      .eq("platform", "instagram")
      .eq("external_account_id", ig.external)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const id = existing.data?.id ?? crypto.randomUUID();
    const envelope = await sealPlatformTokens(
      id,
      { accessToken: token },
      encryptionKey,
      1,
    );
    const { error } = await s.db.rpc("kw_finish_instagram", {
      ...ctx,
      p_session: s.session,
      p_state: b.state,
      p_id: id,
      p_external: ig.external,
      p_username: ig.username,
      p_scopes: ig.scopes,
      p_expires: ig.expires,
      p_business: ig.business,
      p_config: configId,
      p_ciphertext: envelope.ciphertext,
    });
    if (error) throw new Failure("INVALID_CALLBACK", 409);
    return json({ connected: true });
  } catch (e) {
    return e instanceof Failure
      ? json({ error: e.message }, e.status)
      : json({ error: "INSTAGRAM_UNAVAILABLE" }, 502);
  }
}
Deno.serve(handler);
