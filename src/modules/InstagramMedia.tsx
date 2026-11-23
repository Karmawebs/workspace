import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
import { safeUrl, type Row } from "../core/model";
import { loadContentFiles, signedMediaUrl } from "./socialMedia";
export type InstagramMediaRecord = {
  id?: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  storage_path?: string;
  thumbnail_path?: string;
  timestamp?: string;
  permalink?: string;
  children?: { data: InstagramMediaRecord[] };
};
export function instagramMedia(row: Row): InstagramMediaRecord | undefined {
  const metadata = row.metadata as
    { instagram?: InstagramMediaRecord } | undefined;
  return metadata?.instagram;
}
export function InstagramMedia({
  media,
  thumbnail = false,
}: {
  media: InstagramMediaRecord;
  thumbnail?: boolean;
}) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  const path = thumbnail
    ? media.thumbnail_path ||
      (media.media_type !== "VIDEO" ? media.storage_path : undefined)
    : media.storage_path;
  const remote = thumbnail
    ? media.thumbnail_url ||
      (media.media_type !== "VIDEO" ? media.media_url : undefined)
    : media.media_url;
  useEffect(() => {
    let active = true;
    setFailed(false);
    setSrc(safeUrl(remote));
    if (path)
      void db.storage
        .from("instagram-media")
        .createSignedUrl(path, 3600)
        .then(({ data }) => {
          if (active && data) setSrc(data.signedUrl);
        });
    return () => {
      active = false;
    };
  }, [path, remote]);
  if (!src || failed)
    return <span className="muted">Vista previa no disponible</span>;
  return !thumbnail && media.media_type === "VIDEO" ? (
    <video
      src={src}
      controls
      preload="metadata"
      onError={() => setFailed(true)}
    />
  ) : (
    <img
      src={src}
      alt="Publicación de Instagram"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function ContentThumbnail({ row }: { row: Row }) {
  const media = instagramMedia(row);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (media) return;
    let active = true;
    void loadContentFiles(String(row.workspace_id), row.id)
      .then(async (files) => {
        const f = files[0];
        const url = f?.mime_type.startsWith("image/")
          ? await signedMediaUrl(f.storage_path)
          : !f && Array.isArray(row.file_urls)
            ? safeUrl(row.file_urls[0])
            : undefined;
        if (active) setSrc(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [row.id, row.updated_at, media]);
  return media ? (
    <span className="social-entry-thumbnail">
      <InstagramMedia media={media} thumbnail />
    </span>
  ) : src ? (
    <img
      className="social-entry-thumbnail"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setSrc(undefined)}
    />
  ) : null;
}
