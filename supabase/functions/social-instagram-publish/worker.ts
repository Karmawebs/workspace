import { containerParams } from "../_shared/instagram-formats.ts";
export type Snapshot = {
  caption: string;
  files: {
    id: string;
    storage_path: string;
    mime_type: string;
    size: number;
  }[];
};
export type Attempt = {
  id: string;
  format: string;
  external_account_id: string;
  snapshot: Snapshot;
  containers: string[];
  root_id: string | null;
  send_started: boolean;
};
type MetaReply = {
  id?: string;
  status_code?: string;
  permalink?: string;
  account_type?: string;
};
export class Rejection extends Error {}
export interface Publisher {
  graph(path: string, body?: URLSearchParams): Promise<MetaReply>;
  sign(path: string): Promise<string>;
  save(fields: Record<string, unknown>): Promise<void>;
}
const numeric = (id: unknown): id is string =>
  typeof id === "string" && /^\d+$/.test(id);
export async function advance(a: Attempt, p: Publisher) {
  const account = a.external_account_id;
  if (!numeric(account))
    throw new Rejection("Identificador de cuenta inválido.");
  const files = a.snapshot.files;
  if (!a.root_id) {
    const ids = [...a.containers];
    if (ids.length < files.length) {
      const file = files[ids.length];
      const url = await p.sign(file.storage_path);
      const result = await p.graph(
        account + "/media",
        containerParams(a.format, file.mime_type, url, a.snapshot.caption),
      );
      if (!numeric(result.id))
        throw new Rejection("Meta no devolvió el contenedor.");
      ids.push(result.id);
      await p.save({
        containers: ids,
        ...(a.format !== "carousel" ? { root_id: result.id } : {}),
      });
      return "advance";
    }
    for (const id of ids) if (!(await ready(p, id))) return "wait";
    const parent = await p.graph(
      account + "/media",
      new URLSearchParams({
        media_type: "CAROUSEL",
        children: ids.join(","),
        caption: a.snapshot.caption,
      }),
    );
    if (!numeric(parent.id))
      throw new Rejection("No se pudo preparar el carrusel.");
    await p.save({ root_id: parent.id });
    return "advance";
  }
  if (a.send_started) {
    const status = await p.graph(a.root_id + "?fields=status_code");
    if (status.status_code === "PUBLISHED") {
      await p.save({
        state: "published",
        published_at: new Date().toISOString(),
        error_message: null,
      });
      return "done";
    }
    // A timeout may hide a successful publication. Never repeat media_publish.
    await p.save({
      error_message: "Esperando confirmación de Meta del envío anterior.",
    });
    return "wait";
  }
  if (!(await ready(p, a.root_id))) return "wait";
  // Persist the fence BEFORE the only call with an externally visible effect.
  await p.save({ send_started: true });
  const result = await p.graph(
    account + "/media_publish",
    new URLSearchParams({ creation_id: a.root_id }),
  );
  if (!numeric(result.id)) return "wait";
  let permalink: string | null = null;
  try {
    const raw = (await p.graph(result.id + "?fields=permalink")).permalink;
    if (raw && /^https:\/\/(www\.)?instagram\.com\//i.test(raw))
      permalink = raw;
  } catch {
    /* Optional field, the publish response already confirms delivery. */
  }
  await p.save({
    state: "published",
    media_id: result.id,
    permalink,
    published_at: new Date().toISOString(),
    error_message: null,
  });
  return "done";
}
async function ready(p: Publisher, id: string) {
  const status = (await p.graph(id + "?fields=status_code")).status_code;
  if (status === "ERROR" || status === "EXPIRED")
    throw new Rejection(
      "Meta rechazó el archivo o caducó el contenedor. Revisa formato, dimensiones y códec.",
    );
  return status === "FINISHED";
}
