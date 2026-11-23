import {
  admin,
  cors,
  env,
  Failure,
  json,
  scope,
} from "../_shared/social-drive.ts";
import { openPlatformTokens } from "../_shared/social-platform-credentials.ts";
import { fields, mediaURL, normalizeMedia, type Media } from "./media.ts";
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v);
async function sync(connectionId: string) {
  const db = admin();
  const now = new Date().toISOString();
  const { data: job, error: claimError } = await db
    .from("kw_instagram_sync")
    .update({ lease_until: new Date(Date.now() + 150000).toISOString() })
    .eq("connection_id", connectionId)
    .lt("lease_until", now)
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!job) return { busy: true };
  const lease = job.lease_until;
  const save = async (values: Record<string, unknown>) => {
    const r = await db
      .from("kw_instagram_sync")
      .update(values)
      .eq("connection_id", connectionId)
      .eq("lease_until", lease)
      .select("connection_id")
      .single();
    if (r.error) throw r.error;
  };
  try {
    const { data: a, error } = await db
      .from("kw_social_platform_connections")
      .select("*")
      .eq("id", connectionId)
      .eq("platform", "instagram")
      .single();
    if (error || !a || a.status !== "connected")
      throw new Error("ACCOUNT_UNAVAILABLE");
    if (
      !a.authorized_scopes.includes("instagram_basic") ||
      (a.expires_at && Date.parse(a.expires_at) <= Date.now())
    )
      throw new Error("REAUTHORIZE");
    const { data: credential } = await db
      .from("kw_social_platform_credentials")
      .select("ciphertext,key_version")
      .eq("connection_id", a.id)
      .single();
    if (credential?.key_version !== 1) throw new Error("REAUTHORIZE");
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(env("SOCIAL_PLATFORM_KEY_V1")), (c) =>
        c.charCodeAt(0),
      ),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const { accessToken } = await openPlatformTokens(a.id, credential, key);
    const params = new URLSearchParams({ fields, limit: "25" });
    if (job.cursor) params.set("after", job.cursor);
    const response = await fetch(
      `https://graph.facebook.com/v27.0/${a.external_account_id}/media?${params}`,
      {
        headers: { Authorization: "Bearer " + accessToken },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    const page = await response.json();
    if (!response.ok || page.error) {
      const code = page.error?.code;
      throw new Error(
        code === 190
          ? "REAUTHORIZE"
          : [4, 17, 32, 613].includes(code) || response.status === 429
            ? "META_RATE_LIMIT"
            : code === 10 || code === 200
              ? "META_PERMISSION"
              : "META_UNAVAILABLE",
      );
    }
    if (!Array.isArray(page.data)) throw new Error("META_INVALID_MEDIA");
    const fullScan =
      !job.last_full_at || Date.now() - Date.parse(job.last_full_at) > 86400000;
    let sawKnown = false;
    let count = job.cursor ? job.imported_count : 0;
    const start = Date.now();
    for (const value of page.data) {
      const media = normalizeMedia(value);
      const { data: existing } = await db
        .from("kw_content_items")
        .select("metadata")
        .eq("workspace_id", a.workspace_id)
        .eq("project_id", a.project_id)
        .contains("metadata", {
          instagram: { account_id: a.external_account_id, id: media.id },
        })
        .maybeSingle();
      const prior = existing?.metadata?.instagram as Media | undefined;
      if (prior) sawKnown = true;
      // Cache once under a deterministic name. Failed downloads preserve prior assets.
      async function cache(m: Media, old?: Media) {
        for (const [urlKey, pathKey, suffix] of [
          ["media_url", "storage_path", "original"],
          ["thumbnail_url", "thumbnail_path", "thumb"],
        ] as const) {
          if (old?.[pathKey]) {
            m[pathKey] = old[pathKey];
            continue;
          }
          if (!m[urlKey] || Date.now() - start > 65000) continue;
          try {
            const r = await fetch(mediaURL(m[urlKey]!), {
              redirect: "error",
              signal: AbortSignal.timeout(12000),
            });
            const type = (r.headers.get("content-type") || "").split(";")[0];
            if (
              !r.ok ||
              !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(
                type,
              ) ||
              Number(r.headers.get("content-length")) > 52428800
            )
              continue;
            const reader = r.body?.getReader();
            if (!reader) continue;
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.length;
              if (size > 52428800) {
                await reader.cancel();
                throw new Error("MEDIA_TOO_LARGE");
              }
              chunks.push(part.value);
            }
            const path = `${a.id}/${m.id}/${suffix}`;
            const result = await db.storage
              .from("instagram-media")
              .upload(path, new Blob(chunks as BlobPart[], { type }), {
                contentType: type,
                upsert: false,
              });
            if (
              !result.error ||
              String(result.error.statusCode) === "409" ||
              result.error.message.includes("already exists")
            )
              m[pathKey] = path;
          } catch {
            /* Retain remote URL and retry cache on the next refresh. */
          }
        }
      }
      await cache(media, prior);
      for (const child of media.children?.data || [])
        await cache(
          child,
          prior?.children?.data.find((c) => c.id === child.id),
        );
      const imported = await db.rpc("kw_import_instagram_media", {
        p_connection: a.id,
        p_media: media,
      });
      if (imported.error)
        throw new Error(
          imported.error.message.includes("PUBLICATION_UNCONFIRMED")
            ? "PUBLICATION_UNCONFIRMED"
            : "IMPORT_FAILED",
        );
      count++;
    }
    const cursor =
      page.paging?.next && (fullScan || !sawKnown)
        ? page.paging?.cursors?.after
        : null;
    if (
      page.paging?.next &&
      (fullScan || !sawKnown) &&
      (!cursor || cursor === job.cursor)
    )
      throw new Error("META_INVALID_CURSOR");
    await save({
      cursor,
      imported_count: count,
      failures: 0,
      last_error: null,
      lease_until: "-infinity",
      next_at: new Date(Date.now() + (cursor ? 60000 : 1800000)).toISOString(),
      ...(cursor
        ? {}
        : {
            last_success_at: new Date().toISOString(),
            ...(fullScan ? { last_full_at: new Date().toISOString() } : {}),
          }),
    });
    return { count, complete: !cursor };
  } catch (e) {
    const allowed = [
      "REAUTHORIZE",
      "ACCOUNT_UNAVAILABLE",
      "META_RATE_LIMIT",
      "META_PERMISSION",
      "META_UNAVAILABLE",
      "META_INVALID_MEDIA",
      "META_INCOMPLETE_CAROUSEL",
      "META_INVALID_CURSOR",
      "IMPORT_FAILED",
      "PUBLICATION_UNCONFIRMED",
    ];
    const code =
      e instanceof Error && allowed.includes(e.message)
        ? e.message
        : "SYNC_UNAVAILABLE";
    if (code === "REAUTHORIZE")
      await db
        .from("kw_social_platform_connections")
        .update({ status: "reauthorization_required" })
        .eq("id", connectionId);
    await save({
      last_error: code,
      failures: job.failures + 1,
      lease_until: "-infinity",
      next_at: new Date(
        Date.now() +
          Math.min(86400000, 1800000 * 2 ** Math.min(job.failures, 5)),
      ).toISOString(),
    });
    throw new Failure(code, 502);
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    if (body.ticket) {
      if (!uuid(body.connectionId) || !uuid(body.ticket))
        throw new Failure("FORBIDDEN", 403);
      const { data } = await admin()
        .from("kw_instagram_sync")
        .select("connection_id")
        .eq("connection_id", body.connectionId)
        .eq("ticket", body.ticket)
        .maybeSingle();
      if (!data) throw new Failure("FORBIDDEN", 403);
      EdgeRuntime.waitUntil(sync(body.connectionId).catch(() => {}));
      return json({ accepted: true });
    }
    if (!uuid(body.projectId)) throw new Failure("INVALID_PROJECT", 400);
    const s = await scope(req, body.projectId);
    const { data: accounts, error } = await s.db
      .from("kw_social_platform_connections")
      .select("id")
      .eq("project_id", s.projectId)
      .eq("workspace_id", s.workspace)
      .eq("platform", "instagram")
      .eq("status", "connected");
    if (error) throw error;
    if (!accounts?.length)
      throw new Failure("No hay una cuenta de Instagram conectada.", 409);
    const results = [];
    for (const a of accounts) results.push(await sync(a.id));
    return json({ results });
  } catch (e) {
    return json(
      { error: e instanceof Failure ? e.message : "SYNC_UNAVAILABLE" },
      e instanceof Failure ? e.status : 503,
    );
  }
});
