export type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  storage_path?: string;
  thumbnail_path?: string;
  children?: { data: Media[]; paging?: { next?: string } };
};
export const fields =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children.limit(100){id,media_type,media_url,thumbnail_url}";
export function mediaURL(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !["cdninstagram.com", "fbcdn.net"].some(
      (h) => u.hostname === h || u.hostname.endsWith("." + h),
    )
  )
    throw new Error("MEDIA_HOST");
  return u.href;
}
export function normalizeMedia(value: Media): Media {
  if (
    !/^\d+$/.test(value.id) ||
    !value.timestamp ||
    !Number.isFinite(Date.parse(value.timestamp))
  )
    throw new Error("META_INVALID_MEDIA");
  if (value.children?.paging?.next) throw new Error("META_INCOMPLETE_CAROUSEL");
  return { ...value, timestamp: new Date(value.timestamp).toISOString() };
}
