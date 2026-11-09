import { Failure, type Scope } from "../_shared/social-drive.ts";
import { formatError } from "../_shared/instagram-formats.ts";
import { inspectOriginal, readRange } from "./inspect.ts";
import { verifiedBusiness } from "./worker.ts";

type ScheduleRequest = {
  contentId: string;
  attemptId: string;
  connectionId: string;
  existing?: string;
  revision?: number;
  version?: string;
  due: string;
  fileIds: string[];
  values: {
    project_id: string;
    channel: string;
    description: string;
    title: string;
    content_type: string;
  };
};
export async function schedule(
  s: Scope,
  b: ScheduleRequest,
  account: {
    id: string;
    expires_at: string | null;
    account_type: string | null;
  },
) {
  const due = Date.parse(b.due);
  if (!Number.isFinite(due) || due <= Date.now())
    throw new Failure("Elige una fecha futura.", 400);
  if (account.expires_at && Date.parse(account.expires_at) <= due)
    throw new Failure(
      "La autorización de Instagram caduca antes de esa fecha.",
      409,
    );
  if (
    b.values?.project_id !== s.projectId ||
    b.values.channel !== "instagram" ||
    !b.values.title?.trim() ||
    !Array.isArray(b.fileIds) ||
    !b.fileIds.length ||
    b.fileIds.length > 10
  )
    throw new Failure("Revisa el proyecto, el título y los archivos.", 400);
  if (
    b.values.content_type === "story" &&
    !verifiedBusiness(account.account_type)
  )
    throw new Failure("Las historias requieren una cuenta de Empresa.", 409);
  const { data: files, error } = await s.db
    .from("kw_content_files")
    .select("id,content_id,created_by,mime_type,size,storage_path")
    .eq("workspace_id", s.workspace)
    .in("id", b.fileIds);
  if (
    error ||
    !files ||
    files.length !== b.fileIds.length ||
    files.some(
      (f) =>
        f.content_id !== b.contentId &&
        !(f.content_id === null && f.created_by === s.user),
    )
  )
    throw new Failure("Archivos no disponibles en este contenido.", 403);
  const issue = formatError(
    b.values.content_type,
    files,
    b.values.description || "",
  );
  if (issue) throw new Failure(issue, 400);
  await Promise.all(
    files.map(async (f) => {
      const { data, error } = await s.db.storage
        .from("social-media")
        .createSignedUrl(f.storage_path, 180);
      if (error)
        throw new Failure("No se pudo comprobar el archivo privado.", 409);
      await inspectOriginal(b.values.content_type, f, (offset, length) =>
        readRange(data.signedUrl, offset, length, f.size),
      );
    }),
  );
  const result = await s.db.rpc("kw_schedule_instagram", {
    p_workspace: s.workspace,
    p_project: s.projectId,
    p_actor: s.user,
    p_content: b.contentId,
    p_version: b.version || null,
    p_values: b.values,
    p_files: b.fileIds,
    p_connection: account.id,
    p_due: new Date(due).toISOString(),
    p_request: b.attemptId,
    p_existing: b.existing || null,
    p_revision: b.revision ?? null,
  });
  if (result.error)
    throw new Failure(
      "No se pudo confirmar la programación. Comprueba la fecha y recarga el contenido antes de reintentar.",
      409,
    );
  return result.data;
}
