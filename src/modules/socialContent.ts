import { dayKey, safeUrl, text, type Row } from "../core/model";

export const formats = ["post", "carousel", "reel", "story"] as const;
export const statuses = [
  "idea",
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
  "discarded",
] as const;
export const socialLabels: Record<string, string> = {
  post: "Post",
  carousel: "Carrusel",
  discarded: "Descartado",
  instagram: "Instagram",
  facebook: "Facebook",
  instagram_facebook: "Instagram + Facebook",
  reel: "Reel",
  story: "Story",
  idea: "Idea",
  draft: "Preparando",
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

export const channels = [
  "instagram",
  "facebook",
  "instagram_facebook",
] as const;
export type SocialStatus = (typeof statuses)[number];
export function contentStatus(value: unknown): SocialStatus {
  return statuses.includes(value as SocialStatus)
    ? (value as SocialStatus)
    : "idea";
}
export const statusFilters: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "idea", label: "Ideas" },
  { value: "draft", label: "Preparando" },
  { value: "review", label: "Revisión" },
  { value: "approved", label: "Aprobados" },
  { value: "scheduled", label: "Programados" },
  { value: "published", label: "Publicados" },
  { value: "discarded", label: "Descartados" },
];
export function publicationTime(value: unknown): string {
  if (!value) return "";
  const date = new Date(text(value));
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("es", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}
export function publicationTimestamp(
  date: string,
  time: string,
): string | null {
  if (!date && !time) return null;
  if (!date || !time)
    throw new Error("Indica fecha y hora de publicación, o deja ambas vacías.");
  const value = new Date(`${date}T${time}`);
  // Reject nonexistent local times during the spring daylight-saving transition.
  if (
    Number.isNaN(value.getTime()) ||
    dayKey(value) !== date ||
    `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}` !==
      time
  )
    throw new Error("La fecha u hora no existe en tu zona horaria.");
  return value.toISOString();
}
