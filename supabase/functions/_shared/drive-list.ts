import { access, scope, failure, cors, json } from "../_shared/social-drive.ts";
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{10,255}$/.test(value);
}
function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export async function handleDrive(req: Request, authorize: typeof scope = scope) {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    if (!uuid(body.projectId)) return json({ error: "INVALID_PROJECT" }, 400);
    if (body.folderId != null && !validId(body.folderId))
      return json({ error: "INVALID_FOLDER" }, 400);
    if (
      body.pageToken != null &&
      (typeof body.pageToken !== "string" || body.pageToken.length > 2048)
    )
      return json({ error: "INVALID_PAGE_TOKEN" }, 400);

    const context = await authorize(req, body.projectId);
    const db = context.db;
    const { data: folder, error: folderError } = await db
      .from("kw_social_drive_folders")
      .select("drive_folder_id,connection_id")
      .eq("project_id", context.projectId)
      .eq("workspace_id", context.workspace)
      .single();
    if (folderError || !folder)
      return json({ error: "FOLDER_NOT_CONNECTED" }, 409);
    const rootId = folder.drive_folder_id;
    const requestedId = body.folderId ?? rootId;
    const token = await access(context, folder.connection_id);
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
        if (info.mimeType !== "application/vnd.google-apps.folder")
          return json({ error: "NOT_A_FOLDER" }, 400);
        const parents: string[] = Array.isArray(info.parents)
          ? info.parents
          : [];
        if (parents.includes(rootId)) {
          found = true;
          break;
        }
        if (parents.length !== 1 || !validId(parents[0])) break;
        cursor = parents[0];
      }
      if (!found) return json({ error: "FOLDER_OUTSIDE_PROJECT" }, 403);
    }

    const params = new URLSearchParams({
      q: `'${requestedId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
      pageSize: "100",
      orderBy: "folder,name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (body.pageToken) params.set("pageToken", body.pageToken);
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: googleHeaders },
    );
    if (!response.ok) return json({ error: "GOOGLE_LIST_FAILED" }, 502);
    const data = await response.json();
    return json({
      folderId: requestedId,
      files: Array.isArray(data.files)
        ? data.files.filter(
            (f: { mimeType?: string }) =>
              f.mimeType === "application/vnd.google-apps.folder" ||
              [
                "image/jpeg",
                "image/png",
                "image/webp",
                "video/mp4",
                "video/quicktime",
              ].includes(f.mimeType || ""),
          )
        : [],
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
