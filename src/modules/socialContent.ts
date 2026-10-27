import { dayKey, safeUrl, text, type Row } from "../core/model";

export const formats = ["post", "reel", "story"] as const;
export const statuses = [
  "idea",
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
] as const;
export const socialLabels: Record<string, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
  idea: "Idea",
  draft: "Borrador",
  review: "Revisión",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
};
export function fileUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string")
    : [];
}
export function contentFormat(value: unknown): string {
  return formats.some((format) => format === value) ? String(value) : "post";
}
// Only the first entry is a cover. Never fall through to another attachment.
export function drivePreview(value: unknown): string | undefined {
  const safe = safeUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  if (url.hostname !== "drive.google.com" && url.hostname !== "docs.google.com")
    return safe;
  if (/\/folders(?:\/|$)/.test(url.pathname)) return undefined;
  const id =
    url.pathname.match(/^\/(?:file\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1] ||
    (["/open", "/uc", "/thumbnail"].includes(url.pathname)
      ? url.searchParams.get("id")
      : null);
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return undefined;
  const preview = new URL("https://drive.google.com/thumbnail");
  preview.searchParams.set("id", id);
  preview.searchParams.set("sz", "w600");
  const resourceKey = url.searchParams.get("resourcekey");
  if (resourceKey) preview.searchParams.set("resourcekey", resourceKey);
  return preview.href;
}
export function itemsForDay(rows: Row[], date: Date): Row[] {
  return rows
    .filter(
      (row) =>
        row.scheduled_at &&
        dayKey(new Date(text(row.scheduled_at))) === dayKey(date),
    )
    .sort(
      (a, b) =>
        new Date(text(a.scheduled_at)).getTime() -
          new Date(text(b.scheduled_at)).getTime() ||
        Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
        a.id.localeCompare(b.id),
    );
}
