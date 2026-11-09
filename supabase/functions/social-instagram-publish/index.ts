import { inspectOriginal, readRange } from "./inspect.ts";
import {
  admin,
  cors,
  env,
  Failure,
  json,
  scope,
  type Scope,
} from "../_shared/social-drive.ts";
import { openPlatformTokens } from "../_shared/social-platform-credentials.ts";
import { formatError } from "../_shared/instagram-formats.ts";
import { verifiedBusiness, advance, Rejection } from "./worker.ts";
// Supabase Edge Runtime extends Deno with a background task lifetime.
declare const EdgeRuntime: { waitUntil(task: Promise<void>): void };
const table = "kw_instagram_publications";
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(v);
async function connection(
  s: Pick<Scope, "db" | "projectId" | "workspace">,
  id: string,
) {
  const { data: a } = await s.db
    .from("kw_social_platform_connections")
    .select("*")
    .eq("id", id)
    .eq("project_id", s.projectId)
    .eq("workspace_id", s.workspace)
    .eq("platform", "instagram")
    .single();
  if (
    !a ||
    a.status !== "connected" ||
    !a.authorized_scopes.includes("instagram_content_publish") ||
    (a.expires_at && Date.parse(a.expires_at) <= Date.now())
  )
    throw new Rejection("Vuelve a autorizar la cuenta de Instagram.");
  const { data: c } = await s.db
    .from("kw_social_platform_credentials")
    .select("ciphertext,key_version")
    .eq("connection_id", id)
    .single();
  if (c?.key_version !== 1)
    throw new Rejection("La cuenta requiere autorización.");
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(env("SOCIAL_PLATFORM_KEY_V1")), (c) =>
      c.charCodeAt(0),
    ),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const { accessToken } = await openPlatformTokens(id, c, key);
  async function graph(path: string, body?: URLSearchParams) {
    const r = await fetch("https://graph.facebook.com/v27.0/" + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + accessToken },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) {
      const code = (await r.json().catch(() => null))?.error?.code;
      if (r.status >= 500) throw new Error("Meta temporalmente inaccesible.");
      throw new Rejection(
        code === 190
          ? "La autorización ha caducado. Reconecta Instagram."
          : code === 10 || code === 200
            ? "Meta no ha autorizado esta operación. Revisa el acceso de la aplicación."
            : "Meta rechazó la solicitud. Comprueba el archivo y los límites de la cuenta.",
      );
    }
    return await r.json();
  }
  return { account: a, graph };
}
async function run(
  s: Pick<Scope, "db" | "projectId" | "workspace">,
  id: string,
) {
  const end = Date.now() + 85000;
  while (Date.now() < end) {
    const { data: a } = await s.db
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("workspace_id", s.workspace)
      .eq("project_id", s.projectId)
      .single();
    if (!a || a.state !== "publishing") return;
    const guard = () =>
      s.db
        .from(table)
        .update({
          revision: a.revision + 1,
          lease_until: new Date(Date.now() + 65000).toISOString(),
        })
        .eq("id", id)
        .eq("revision", a.revision)
        .lt("lease_until", new Date().toISOString())
        .select("id")
        .maybeSingle();
    if (!(await guard()).data) return;
    let fenced = a.send_started;
    async function save(fields: Record<string, unknown>) {
      const r = await s.db
        .from(table)
        .update(fields)
        .eq("id", id)
        .eq("revision", a.revision + 1)
        .select("id")
        .single();
      if (r.error) throw new Error("Lease lost");
      if (fields.send_started) fenced = true;
    }
    let delay = 0;
    try {
      if (Date.now() - Date.parse(a.created_at) > 86400000) {
        await save({
          state: "error",
          error_message: fenced
            ? "Resultado incierto. Comprueba Instagram antes de cualquier otro envío."
            : "El intento ha caducado. Puedes reintentar.",
        });
        return;
      }
      if (!fenced) {
        const { data: content } = await s.db
          .from("kw_content_items")
          .select("id")
          .eq("id", a.content_id)
          .eq("workspace_id", s.workspace)
          .eq("project_id", s.projectId)
          .maybeSingle();
        if (!content)
          throw new Rejection(
            "El contenido ya no pertenece al proyecto confirmado.",
          );
      }
      const { graph, account } = await connection(s, a.connection_id);
      if (account.external_account_id !== a.external_account_id)
        throw new Rejection("Cuenta no disponible.");
      const outcome = await advance(a, {
        graph,
        save,
        sign: async (path) => {
          const { data, error } = await s.db.storage
            .from("social-media")
            .createSignedUrl(path, 3600);
          if (error) throw new Rejection("Archivo privado no disponible.");
          const file = a.snapshot.files.find(
            (f: { storage_path: string }) => f.storage_path === path,
          );
          if (!file) throw new Rejection("Archivo no disponible.");
          await inspectOriginal(a.format, file, (offset, length) =>
            readRange(data.signedUrl, offset, length, file.size),
          );
          return data.signedUrl;
        },
      });
      if (outcome === "done") return;
      if (outcome === "wait") delay = 60000;
    } catch (e) {
      // Rejection before dispatch can be retried. Ambiguous dispatch can only be reconciled.
      await save(
        fenced
          ? { error_message: "Envío pendiente de confirmar por Meta." }
          : {
              state: "error",
              error_message:
                e instanceof Rejection
                  ? e.message
                  : "No se pudo preparar la publicación. Puedes reintentar.",
            },
      );
      if (!fenced) return;
      delay = 60000;
    }
    await save({ lease_until: new Date(Date.now() + delay).toISOString() });
    if (Date.now() + delay >= end) return;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay + 20));
  }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no admitido." }, 405);
  try {
    const b = await req.json();
    if (b.action === "resume") {
      if (!uuid(b.attemptId) || !uuid(b.ticket))
        throw new Failure("Solicitud inválida.", 403);
      const db = admin();
      const { data } = await db
        .from(table)
        .select("project_id,workspace_id")
        .eq("id", b.attemptId)
        .eq("worker_ticket", b.ticket)
        .eq("state", "publishing")
        .maybeSingle();
      if (!data) throw new Failure("Solicitud inválida.", 403);
      EdgeRuntime.waitUntil(
        run(
          { db, projectId: data.project_id, workspace: data.workspace_id },
          b.attemptId,
        ),
      );
      return json({ accepted: true });
    }
    if (!uuid(b.projectId) || !uuid(b.contentId))
      throw new Failure("Contenido inválido.", 400);
    const s = await scope(req, b.projectId);
    if (b.action === "storyEligibility" && uuid(b.connectionId)) {
      const { account, graph } = await connection(s, b.connectionId);
      return json({
        eligible:
          verifiedBusiness(account.account_type) &&
          (await graph(account.external_account_id + "?fields=id")).id ===
            account.external_account_id,
      });
    }
    const { data: c } = await s.db
      .from("kw_content_items")
      .select("id,updated_at,channel,content_type,description")
      .eq("id", b.contentId)
      .eq("project_id", s.projectId)
      .eq("workspace_id", s.workspace)
      .single();
    if (!c) throw new Failure("Contenido no disponible.", 404);
    const latest = async () =>
      (
        await s.db
          .from(table)
          .select(
            "id,state,send_started,error_message,published_at,media_id,permalink",
          )
          .eq("content_id", c.id)
          .eq("project_id", s.projectId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .throwOnError()
      ).data;
    if (b.action === "status") {
      const attempt = await latest();
      if (attempt?.state === "publishing")
        EdgeRuntime.waitUntil(run(s, attempt.id));
      return json({ attempt });
    }
    if (b.action !== "confirm" || !uuid(b.connectionId) || !uuid(b.attemptId))
      throw new Failure("Falta confirmar la publicación.", 400);
    const existing = await latest();
    if (
      existing &&
      (existing.id === b.attemptId ||
        existing.state !== "error" ||
        existing.send_started)
    )
      return json({ attempt: existing });
    if (c.channel !== "instagram" || c.updated_at !== b.version)
      throw new Rejection(
        "El contenido ha cambiado. Vuelve a abrir la vista previa.",
      );
    const { account, graph } = await connection(s, b.connectionId);
    const { data: files, error } = await s.db
      .from("kw_content_files")
      .select("id,storage_path,mime_type,size")
      .eq("content_id", c.id)
      .eq("workspace_id", s.workspace)
      .order("sort_order")
      .order("id");
    if (error || !files)
      throw new Rejection("No se pudieron leer los archivos.");
    if (JSON.stringify(files.map((f) => f.id)) !== JSON.stringify(b.fileIds))
      throw new Rejection("Los archivos han cambiado.");
    for (const f of files)
      if (!f.storage_path.startsWith(s.workspace + "/" + f.id + "/"))
        throw new Rejection("Ruta de archivo inválida.");
    const reason = formatError(c.content_type, files, c.description || "");
    if (reason) throw new Rejection(reason);
    if (
      c.content_type === "story" &&
      (!verifiedBusiness(account.account_type) ||
        (await graph(account.external_account_id + "?fields=id")).id !==
          account.external_account_id)
    )
      throw new Rejection(
        "Meta requiere una cuenta Business para publicar historias.",
      );
    const { error: write } = await s.db.from(table).insert({
      id: b.attemptId,
      content_id: c.id,
      workspace_id: s.workspace,
      project_id: s.projectId,
      connection_id: account.id,
      username: account.username,
      external_account_id: account.external_account_id,
      format: c.content_type,
      snapshot: { version: c.updated_at, files, caption: c.description || "" },
    });
    if (write && write.code !== "23505") throw write;
    const attempt = await latest();
    if (attempt?.state === "publishing")
      EdgeRuntime.waitUntil(run(s, attempt.id));
    return json({ attempt });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Failure || e instanceof Rejection
            ? e.message
            : "Publicación temporalmente no disponible.",
      },
      e instanceof Failure ? e.status : e instanceof Rejection ? 409 : 503,
    );
  }
});
