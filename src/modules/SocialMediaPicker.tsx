import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Film,
  ImageOff,
  UploadCloud,
  X,
} from "lucide-react";
import {
  MEDIA_ACCEPT,
  mediaType,
  signedMediaUrl,
  type ContentFile,
} from "./socialMedia";
import { message } from "../core/data";
import "./social-media.css";
export type MediaItem = {
  key: string;
  record?: ContentFile;
  file?: File;
  status: "saved" | "pending" | "uploading" | "uploaded" | "error";
  progress: number;
  error?: string;
};
export function MediaPreview({
  record,
  file,
}: {
  record?: ContentFile;
  file?: File;
}) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);
  const mime = record?.mime_type || (file ? mediaType(file).mime : "");
  useEffect(() => {
    let active = true;
    let local: string | undefined;
    setFailed(false);
    setSrc(undefined);
    if (mime.startsWith("video/") && !record?.preview_storage_path) return;
    if (file) {
      local = URL.createObjectURL(file);
      setSrc(local);
    }
    const refresh = () => {
      if (record && !file)
        void signedMediaUrl(record.preview_storage_path || record.storage_path)
          .then((url) => {
            if (active) {
              setSrc(url);
              setFailed(false);
            }
          })
          .catch(() => {
            if (active) setFailed(true);
          });
    };
    refresh();
    const timer = window.setInterval(refresh, 240000);
    return () => {
      active = false;
      clearInterval(timer);
      if (local) URL.revokeObjectURL(local);
    };
  }, [record?.storage_path, record?.preview_storage_path, file, mime]);
  if (src && !failed)
    return (
      <img
        src={src}
        alt="Portada del contenido"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  return (
    <div className="social-preview-placeholder">
      {mime.startsWith("video/") ? (
        <>
          <Film size={24} />
          <span>Vídeo</span>
        </>
      ) : (
        <>
          <ImageOff size={22} />
          <span>Sin vista previa</span>
        </>
      )}
    </div>
  );
}
export function SocialMediaPicker({
  items,
  onChange,
  disabled,
  maximum,
}: {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  disabled: boolean;
  maximum?: number;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  function add(files: FileList | File[]) {
    if (disabled) return;
    const next: MediaItem[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        mediaType(file, maximum);
        next.push({
          key: crypto.randomUUID(),
          file,
          status: "pending",
          progress: 0,
        });
      } catch (e) {
        errors.push(`${file.name}: ${message(e)}`);
      }
    }
    if (items.length + next.length > 100)
      errors.push("Máximo 100 archivos por contenido.");
    else onChange([...items, ...next]);
    setError(errors.join(" "));
  }
  function move(index: number, direction: number) {
    const next = [...items];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  }
  return (
    <section
      className="social-media-picker"
      aria-label="Archivos del contenido"
    >
      <span className="social-field-label">Archivos</span>
      <label
        className={`social-media-drop ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={25} />
        <strong>Arrastra aquí tus fotos o vídeos</strong>
        <span>o selecciona archivos desde tu Mac</span>
        <small>
          JPG, PNG, WEBP, MP4 y MOV ·{" "}
          {maximum
            ? `hasta ${Math.round(maximum / 1024 ** 2)} MB por archivo`
            : "Comprobando límite de subida…"}
        </small>
        <input
          aria-label="Seleccionar fotos o vídeos"
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ol className="social-media-list">
        {items.map((item, index) => (
          <li key={item.key}>
            <div className="social-media-thumb">
              <MediaPreview record={item.record} file={item.file} />
            </div>
            <div className="social-media-info">
              <strong>
                {item.file?.name || item.record?.original_filename}
              </strong>
              <small>
                {index === 0 ? "Portada · " : ""}
                {(
                  (item.file?.size || item.record?.size || 0) /
                  1024 ** 2
                ).toFixed(1)}{" "}
                MB
              </small>
              <span role="status">
                {item.status === "uploading"
                  ? `Subiendo… ${item.progress}%`
                  : item.status === "error"
                    ? `⚠ ${item.error}`
                    : item.status === "pending"
                      ? "Pendiente de guardar"
                      : item.status === "uploaded"
                        ? "✓ Subido · pendiente de guardar"
                        : "✓ Guardado"}
              </span>
              {item.status === "uploading" && (
                <progress
                  max={100}
                  value={item.progress}
                  aria-label={`Subiendo ${item.file?.name}`}
                />
              )}
            </div>
            <div className="social-media-actions">
              <button
                type="button"
                className="icon-button"
                disabled={disabled || index === 0}
                aria-label={`Subir archivo ${index + 1}`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={disabled || index === items.length - 1}
                aria-label={`Bajar archivo ${index + 1}`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                disabled={disabled}
                aria-label={`Eliminar archivo ${index + 1}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <X size={16} />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
