import { useEffect, useRef, useState } from "react";
import { FileImage, FileVideo, Folder, HardDrive, RefreshCw, ChevronRight } from "lucide-react";
import { SocialDriveConnection } from "./SocialDriveConnection";
import { db } from "../lib/supabase";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};
type DriveResponse = {
  folderId: string;
  files: DriveFile[];
  nextPageToken: string | null;
};
const FOLDER = "application/vnd.google-apps.folder";

export function SocialDriveBrowser({
  projectId,
  onImport,
}: {
  projectId: string;
  onImport: (files: File[]) => void;
}) {
  const [path, setPath] = useState<{ id?: string; name: string }[]>([
    { name: "Carpeta del proyecto" },
  ]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [importing, setImporting] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = path[path.length - 1];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setFiles([]);
    setNextPage(null);
    setSelected([]);
    void db.functions
      .invoke<DriveResponse>("social-drive-list", {
        body: { projectId, ...(current.id ? { folderId: current.id } : {}) },
      })
      .then(async ({ data, error: invokeError }) => {
        if (!alive) return;
        if (invokeError || !data || !Array.isArray(data.files)) {
          const reason = await invokeError?.context?.json?.().catch(() => null);
          if (!alive) return;
          const errors: Record<string, string> = {
            FOLDER_NOT_CONNECTED:
              "Conecta la cuenta y elige la carpeta del proyecto.",
            FORBIDDEN:
              "Necesitas permisos de administración de este workspace para acceder a Drive.",
            GOOGLE_REAUTH_REQUIRED:
              "La autorización de Google ha caducado. Vuelve a conectar la cuenta.",
          };
          setError(
            errors[reason?.error] ||
              "No se pudo abrir Google Drive. Vuelve a intentarlo.",
          );
          return;
        }
        setFiles(data.files);
        setNextPage(data.nextPageToken);
      })
      .catch(() => {
        if (alive) setError("No se pudo conectar con Google Drive.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId, current.id, revision]);

  async function more() {
    if (!nextPage || loading) return;
    setLoading(true);
    const { data, error: invokeError } =
      await db.functions.invoke<DriveResponse>("social-drive-list", {
        body: {
          projectId,
          ...(current.id ? { folderId: current.id } : {}),
          pageToken: nextPage,
        },
      });
    if (invokeError || !data || !Array.isArray(data.files))
      setError("No se pudieron cargar más archivos.");
    else {
      setFiles((old) => [
        ...old,
        ...data.files.filter(
          (file) => !old.some((existing) => existing.id === file.id),
        ),
      ]);
      setNextPage(data.nextPageToken);
    }
    setLoading(false);
  }

  async function importSelected() {
    if (!selected.length || importing) return;
    setImporting(true);
    setError("");
    const imported: File[] = [];
    try {
      for (const id of selected) {
        if (!active.current) return;
        const file = files.find((entry) => entry.id === id);
        if (
          !file ||
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "video/mp4",
            "video/quicktime",
          ].includes(file.mimeType)
        ) {
          throw new Error("Formato de archivo incompatible.");
        }
        const { data, error: downloadError } = await db.functions.invoke<Blob>(
          "social-drive-download",
          {
            body: { projectId, fileId: id },
          },
        );
        if (downloadError || !(data instanceof Blob))
          throw new Error("No se pudo descargar " + file.name);
        imported.push(new File([data], file.name, { type: file.mimeType }));
      }
      if (!active.current) return;
      onImport(imported);
      setSelected([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron importar los archivos.",
      );
    } finally {
      setImporting(false);
    }
  }
  return (
    <section aria-label="Explorador de Google Drive" className="social-drive-browser">
      <div className="social-drive-toolbar">
        <div className="social-drive-heading">
          <span className="social-drive-brand"><HardDrive size={18} aria-hidden="true" /></span>
          <div><strong>Google Drive</strong><small>Biblioteca del proyecto</small></div>
        </div>
        <button className="social-drive-refresh" type="button" onClick={() => setRevision((n) => n + 1)} disabled={loading} aria-label="Actualizar archivos" title="Actualizar archivos">
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>
      <SocialDriveConnection projectId={projectId} onChange={() => {
        setPath([{ name: "Carpeta del proyecto" }]);
        setRevision((n) => n + 1);
      }} />
      <nav className="social-drive-breadcrumbs" aria-label="Ruta de carpetas">
        {path.map((entry, index) => (
          <span className="social-drive-crumb" key={entry.id || "root"}>
            {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
            <button type="button" disabled={loading || index === path.length - 1}
              aria-current={index === path.length - 1 ? "page" : undefined}
              onClick={() => setPath((old) => old.slice(0, index + 1))}>{entry.name}</button>
          </span>
        ))}
      </nav>
      {loading && <p role="status" className="social-drive-notice">Cargando archivos de Drive…</p>}
      {error && <p role="alert" className="error social-drive-notice">{error}</p>}
      {!loading && !error && files.length === 0 && <p className="social-drive-notice">Esta carpeta no contiene imágenes, vídeos o subcarpetas compatibles.</p>}
      <ul className="social-drive-files">
        {files.map((file) => (
          <li key={file.id}>
            {file.mimeType === FOLDER ? (
              <button className="social-drive-file-row" type="button" disabled={loading}
                onClick={() => setPath((old) => [...old, { id: file.id, name: file.name }])}>
                <Folder className="social-drive-file-icon social-drive-folder-icon" size={19} aria-hidden="true" />
                <span className="social-drive-file-name">{file.name}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <label className={`social-drive-file-row ${selected.includes(file.id) ? "is-selected" : ""}`}>
                <input type="checkbox" checked={selected.includes(file.id)}
                  onChange={(event) => setSelected((old) => event.target.checked
                    ? [...old, file.id] : old.filter((id) => id !== file.id))} />
                {file.mimeType.startsWith("video/") ?
                  <FileVideo className="social-drive-file-icon" size={19} aria-hidden="true" /> :
                  <FileImage className="social-drive-file-icon" size={19} aria-hidden="true" />}
                <span className="social-drive-file-name">{file.name}</span>
              </label>
            )}
          </li>
        ))}
      </ul>
      {nextPage && <button className="social-drive-secondary" type="button" disabled={loading} onClick={() => void more()}>Cargar más</button>}
      {selected.length > 0 && <div className="social-drive-import">
        <p role="status">{selected.length} archivo(s) seleccionado(s) · Máximo 50 MiB por archivo</p>
        <button className="social-drive-primary" type="button" disabled={importing || loading} onClick={() => void importSelected()}>
          {importing ? "Importando…" : "Añadir al contenido"}
        </button>
      </div>}
    </section>
  );
}
