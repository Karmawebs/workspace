import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { text, type Row, safeUrl } from "../core/model";
import { RichText } from "../components/rich-text/RichText";
import { instagramMedia, InstagramMedia } from "./InstagramMedia";
import { loadContentFiles, type ContentFile } from "./socialMedia";
import { MediaPreview } from "./SocialMediaPicker";
import { socialLabels } from "./socialContent";
export function SocialPublishedContent({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<ContentFile[]>([]);
  const media = instagramMedia(row);
  useEffect(() => {
    ref.current?.showModal();
    void loadContentFiles(text(row.workspace_id), row.id)
      .then(setFiles)
      .catch(() => {});
  }, [row.id, row.workspace_id]);
  const date =
    media?.timestamp ||
    text(
      row.instagram_published_at ||
        row.published_at ||
        row.calendar_at ||
        row.scheduled_at,
    );
  const link = safeUrl(media?.permalink || row.permalink);
  return (
    <dialog
      ref={ref}
      className="editor social-content-editor social-published"
      onCancel={onClose}
    >
      <header>
        <div>
          <span className="eyebrow">SOCIAL / PUBLICADO</span>
          <h2>{text(row.title)}</h2>
        </div>
        <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <p className="muted">
        {socialLabels[text(row.content_type)] || "Post"} ·{" "}
        {date ? new Date(date).toLocaleString("es") : "Fecha no disponible"} ·
        Solo consulta
      </p>
      <div className="social-published-media">
        {media
          ? (media.children?.data?.length ? media.children.data : [media]).map(
              (m, i) => <InstagramMedia key={m.id || i} media={m} />,
            )
          : files.length
            ? files.map((f) => <MediaPreview key={f.id} record={f} />)
            : (Array.isArray(row.file_urls) ? row.file_urls : []).map(
                (u, i) => (
                  <img key={i} src={safeUrl(u)} alt="Contenido publicado" />
                ),
              )}
      </div>
      {media?.caption !== undefined ? (
        <p style={{ whiteSpace: "pre-wrap" }}>{media.caption}</p>
      ) : (
        <RichText value={row.description} />
      )}
      {link && /^https:\/\/(www\.)?instagram\.com\//.test(link) && (
        <a href={link} target="_blank" rel="noreferrer">
          Abrir en Instagram
        </a>
      )}
    </dialog>
  );
}
