import { access, scope, failure, cors } from "../_shared/social-drive.ts";
const reply = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const idOk = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{10,255}$/.test(v);
const uuidOk = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
export async function handleDrive(req: Request, authorize: typeof scope = scope) {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply("METHOD_NOT_ALLOWED", 405);
  try {
    const body = await req.json();
    if (!uuidOk(body.projectId) || !idOk(body.fileId))
      return reply("INVALID_INPUT", 400);
    const context = await authorize(req, body.projectId);
    const db = context.db;
    const { data: folder } = await db
      .from("kw_social_drive_folders")
      .select("drive_folder_id,connection_id")
      .eq("workspace_id", context.workspace)
      .eq("project_id", context.projectId)
      .maybeSingle();
    if (!folder) return reply("FOLDER_NOT_CONNECTED", 409);
    const token = await access(context, folder.connection_id);
    const headers = { Authorization: `Bearer ${token}` };
    let cursor = body.fileId;
    let info:
      | {
          id: string;
          name: string;
          mimeType: string;
          size?: string;
          parents?: string[];
        }
      | undefined;
    let inside = false;
    const visited = new Set<string>();
    for (let depth = 0; depth < 30; depth++) {
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const metadata = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cursor)}?fields=id,name,mimeType,size,parents,trashed&supportsAllDrives=true`,
        { headers },
      );
      if (!metadata.ok) return reply("GOOGLE_FILE_UNAVAILABLE", 502);
      const current = await metadata.json();
      if (current.trashed) return reply("GOOGLE_FILE_UNAVAILABLE", 404);
      if (!info) info = current;
      if (current.parents?.includes(folder.drive_folder_id)) {
        inside = true;
        break;
      }
      if (
        !Array.isArray(current.parents) ||
        current.parents.length !== 1 ||
        !idOk(current.parents[0])
      )
        break;
      cursor = current.parents[0];
    }
    if (!inside || !info) return reply("FILE_OUTSIDE_PROJECT", 403);
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
      ].includes(info.mimeType)
    )
      return reply("UNSUPPORTED_FORMAT", 415);
    if (
      !info.size ||
      !Number.isSafeInteger(Number(info.size)) ||
      Number(info.size) > 50 * 1024 * 1024
    )
      return reply("FILE_TOO_LARGE", 413);
    const file = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?alt=media&supportsAllDrives=true`,
      { headers },
    );
    if (!file.ok) return reply("GOOGLE_DOWNLOAD_FAILED", 502);
    const length = file.headers.get("content-length");
    if (!file.body || (length !== null && length !== info.size))
      return reply("FILE_SIZE_MISMATCH", 502);
    // Drive may stream without a Content-Length header. Bound the actual bytes too.
    const expected = Number(info.size);
    let received = 0;
    const bounded = file.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > expected) throw new Error("FILE_SIZE_MISMATCH");
          controller.enqueue(chunk);
        },
        flush() {
          if (received !== expected) throw new Error("FILE_SIZE_MISMATCH");
        },
      }),
    );
    return new Response(bounded, {
      headers: { ...cors, "Content-Type": "application/octet-stream" },
    });
  } catch (error) {
    return failure(error);
  }
}
