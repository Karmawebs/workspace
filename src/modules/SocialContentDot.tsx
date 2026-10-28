import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { text, type Row } from "../core/model";
import { contentFormat, drivePreview, socialLabels } from "./socialContent";

import { loadContentFiles, type ContentFile } from "./socialMedia";
import { MediaPreview } from "./SocialMediaPicker";

function Preview({
  row,
  anchor,
  id,
}: {
  row: Row;
  anchor: HTMLButtonElement;
  id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [failed, setFailed] = useState(false);
  const [media, setMedia] = useState<ContentFile | null>();
  useEffect(() => {
    let active = true;
    if (row.workspace_id)
      void loadContentFiles(text(row.workspace_id), text(row.id))
        .then((files) => {
          if (active) setMedia(files[0] || null);
        })
        .catch(() => {
          if (active) setMedia(null);
        });
    else setMedia(null);
    return () => {
      active = false;
    };
  }, [row.id, row.workspace_id, row.updated_at]);
  const first = Array.isArray(row.file_urls) ? row.file_urls[0] : undefined;
  const src = drivePreview(first);
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const box = ref.current?.getBoundingClientRect();
      if (!box) return;
      const above = rect.top - box.height - 8;
      setPosition({
        left: Math.max(
          8,
          Math.min(
            rect.left + rect.width / 2 - box.width / 2,
            window.innerWidth - box.width - 8,
          ),
        ),
        top: Math.max(
          8,
          Math.min(
            above >= 8 ? above : rect.bottom + 8,
            window.innerHeight - box.height - 8,
          ),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="social-calendar-preview"
      style={position}
    >
      {media ? (
        <MediaPreview record={media} />
      ) : (media === null || !row.workspace_id) && src && !failed ? (
        <img
          src={src}
          alt="Portada del contenido"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="social-preview-placeholder">
          <ImageOff size={22} />
          <span>Sin vista previa</span>
        </div>
      )}
      <strong>{text(row.title)}</strong>
      <small>
        {socialLabels[text(row.content_type)] || text(row.content_type)}
      </small>
    </div>,
    document.body,
  );
}
export function SocialContentDot({
  row,
  onEdit,
}: {
  row: Row;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = socialLabels[text(row.content_type)] || text(row.content_type);
  return (
    <>
      <button
        ref={ref}
        className={`social-calendar-dot ${contentFormat(row.content_type)}`}
        aria-label={`${label}: ${text(row.title)}`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        onClick={() => {
          setOpen(false);
          onEdit();
        }}
      />
      {open && ref.current && (
        <Preview
          key={text(row.file_urls)}
          row={row}
          anchor={ref.current}
          id={id}
        />
      )}
    </>
  );
}
