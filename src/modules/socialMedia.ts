import { Upload } from "tus-js-client";
import { db, config } from "../lib/supabase";
import type { Database } from "../lib/database.types";

export type ContentFile =
  Database["public"]["Tables"]["kw_content_files"]["Row"];
export const SOCIAL_BUCKET = "social-media";
export const MAX_MEDIA_BYTES = 2 * 1024 ** 3;
export const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,.mp4,.mov";
const mimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};
export function mediaType(file: File, maximum = MAX_MEDIA_BYTES) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const mime = mimeByExtension[extension];
  if (
    !mime ||
    (file.type &&
      file.type !== mime &&
      file.type !== "application/octet-stream")
  )
    throw new Error("Formato no admitido. Usa JPG, PNG, WEBP, MP4 o MOV.");
  if (!file.size || file.size > maximum)
    throw new Error(
      `El archivo debe tener contenido y no superar ${Math.round(maximum / 1024 ** 2)} MB.`,
    );
  return { mime, extension };
}
// Read only a tiny signature, never the full video into JS memory.
export async function validateMedia(file: File) {
  const type = mediaType(file);
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  const valid =
    type.mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type.mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        : type.mime === "image/webp"
          ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP"
          : ["ftyp", "moov", "mdat", "wide", "free"].includes(ascii(4, 8));
  if (!valid)
    throw new Error("El contenido del archivo no coincide con su formato.");
  return type;
}
export async function getSocialUploadLimit() {
  const { data, error } = await db.rpc("kw_social_upload_limit");
  if (error) throw error;
  if (!data || data <= 0)
    throw new Error("No se pudo comprobar el límite de subida.");
  return Math.min(data, MAX_MEDIA_BYTES);
}
export async function loadContentFiles(workspaceId: string, contentId: string) {
  const { data, error } = await db
    .from("kw_content_files")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("content_id", contentId)
    .order("sort_order")
    .order("id");
  if (error) throw error;
  return data || [];
}
export async function signedMediaUrl(path: string) {
  const { data, error } = await db.storage
    .from(SOCIAL_BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
export async function reserveMedia(workspaceId: string, file: File) {
  const { mime, extension } = await validateMedia(file);
  const id = crypto.randomUUID();
  const { data, error } = await db
    .from("kw_content_files")
    .insert({
      id,
      workspace_id: workspaceId,
      storage_path: `${workspaceId}/${id}/original.${extension}`,
      original_filename: file.name.slice(0, 255),
      mime_type: mime,
      size: file.size,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
export async function uploadMedia(
  file: File,
  record: ContentFile,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
  recovering = false,
) {
  if (signal.aborted) throw new Error("Subida cancelada.");
  // Recover a completed upload whose final response was lost before retrying TUS.
  if (recovering) {
    const existing = await db.storage
      .from(SOCIAL_BUCKET)
      .info(record.storage_path);
    if (signal.aborted) throw new Error("Subida cancelada.");
    if (
      existing.data?.size === record.size &&
      existing.data.contentType === record.mime_type
    ) {
      onProgress(100);
      return;
    }
  }
  return new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const upload = new Upload(file, {
      endpoint: `${config.url.replace(".supabase.co", ".storage.supabase.co")}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () => `social:${record.storage_path}`,
      headers: { apikey: config.key },
      metadata: {
        bucketName: SOCIAL_BUCKET,
        objectName: record.storage_path,
        contentType: record.mime_type,
        cacheControl: "300",
      },
      onBeforeRequest: async (request) => {
        const { data, error } = await db.auth.getSession();
        if (error || !data.session)
          throw new Error("La sesión ha caducado. Vuelve a iniciar sesión.");
        request.setHeader(
          "authorization",
          `Bearer ${data.session.access_token}`,
        );
      },
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onError: (error) =>
        done(
          new Error(
            error.message.includes("413")
              ? "Supabase ha rechazado el tamaño del archivo. Revisa el límite global de Storage."
              : "No se pudo subir el archivo. Comprueba la conexión y vuelve a guardar.",
          ),
        ),
      onSuccess: () => done(),
    });
    const abort = () => {
      void upload.abort().then(
        () => done(new Error("Subida cancelada.")),
        () => done(new Error("Subida cancelada.")),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    void upload
      .findPreviousUploads()
      .then((previous) => {
        if (signal.aborted) return;
        if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch((error: Error) => done(error));
  });
}
export async function discardReservation(id: string, workspaceId: string) {
  const { error } = await db
    .from("kw_content_files")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("content_id", null);
  if (error) throw error;
}
// Durable outbox: never delete Storage until the DB removal has committed.
// Errors leave the queue intact; next Social visit retries it.
export async function cleanSocialMedia(workspaceId: string) {
  const expired = await db
    .from("kw_content_files")
    .delete()
    .eq("workspace_id", workspaceId)
    .is("content_id", null)
    .lt("created_at", new Date(Date.now() - 86400000).toISOString());
  if (expired.error) throw expired.error;
  const queue = await db
    .from("kw_social_storage_cleanup")
    .select("storage_path")
    .eq("workspace_id", workspaceId)
    .order("created_at")
    .limit(100);
  if (queue.error) throw queue.error;
  if (!queue.data.length) return;
  const paths = queue.data.map((row) => row.storage_path);
  const removed = await db.storage.from(SOCIAL_BUCKET).remove(paths);
  if (removed.error) throw removed.error;
  const ack = await db
    .from("kw_social_storage_cleanup")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("storage_path", paths);
  if (ack.error) throw ack.error;
}
