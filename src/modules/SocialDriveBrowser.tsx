import { useEffect, useState } from "react";
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

export function SocialDriveBrowser({ projectId, onImport }: { projectId: string; onImport: (files: File[]) => void }) {
  const [path, setPath] = useState<{ id?: string; name: string }[]>([{ name: "Carpeta del proyecto" }]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [importing, setImporting] = useState(false);
  const current = path[path.length - 1];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setFiles([]);
    setNextPage(null);
    setSelected([]);
    void db.functions.invoke<DriveResponse>("social-drive-list", {
      body: { projectId, ...(current.id ? { folderId: current.id } : {}) },
    }).then(({ data, error: invokeError }) => {
      if (!alive) return;
      if (invokeError || !data || !Array.isArray(data.files)) {
        setError("No se pudo abrir Google Drive. Comprueba que la carpeta esté vinculada y la conexión autorizada.");
        return;
      }
      setFiles(data.files);
      setNextPage(data.nextPageToken);
    }).catch(() => {
      if (alive) setError("No se pudo conectar con Google Drive.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, current.id, revision]);

  async function more() {
    if (!nextPage || loading) return;
    setLoading(true);
    const { data, error: invokeError } = await db.functions.invoke<DriveResponse>("social-drive-list", {
      body: { projectId, ...(current.id ? { folderId: current.id } : {}), pageToken: nextPage },
    });
    if (invokeError || !data || !Array.isArray(data.files)) setError("No se pudieron cargar más archivos.");
    else {
      setFiles((old) => [...old, ...data.files.filter((file) => !old.some((existing) => existing.id === file.id))]);
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
        const file = files.find((entry) => entry.id === id);
        if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.mimeType)) {
          throw new Error("Por ahora solo se pueden importar imágenes JPG, PNG y WEBP de hasta 10 MB.");
        }
        const { data, error: downloadError } = await db.functions.invoke<Blob>("social-drive-download", {
          body: { projectId, fileId: id },
        });
        if (downloadError || !(data instanceof Blob)) throw new Error("No se pudo descargar " + file.name);
        imported.push(new File([data], file.name, { type: file.mimeType }));
      }
      onImport(imported);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron importar los archivos.");
    } finally {
      setImporting(false);
    }
  }
  return (
    <section aria-label="Explorador de Google Drive" className="social-drive-browser">
      <div className="social-drive-toolbar">
        <strong>Google Drive · Biblioteca del proyecto</strong>
        <button type="button" onClick={() => setRevision((n) => n + 1)} disabled={loading}>Actualizar</button>
      </div>
      <nav aria-label="Ruta de carpetas">
        {path.map((entry, index) => (
          <button key={entry.id || "root"} type="button" disabled={loading || index === path.length - 1}
            onClick={() => setPath((old) => old.slice(0, index + 1))}>
            {entry.name}{index < path.length - 1 ? " /" : ""}
          </button>
        ))}
      </nav>
      {loading && <p role="status">Cargando archivos de Drive…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {!loading && !error && files.length === 0 && <p>Esta carpeta no contiene imágenes, vídeos o subcarpetas compatibles.</p>}
      <ul className="social-drive-files">
        {files.map((file) => (
          <li key={file.id}>
            {file.mimeType === FOLDER ? (
              <button type="button" disabled={loading} onClick={() => setPath((old) => [...old, { id: file.id, name: file.name }])}>
                📁 {file.name}
              </button>
            ) : (
              <label>
                <input type="checkbox" checked={selected.includes(file.id)}
                  onChange={(event) => setSelected((old) => event.target.checked ? [...old, file.id] : old.filter((id) => id !== file.id))} />
                {file.mimeType.startsWith("video/") ? "🎬" : "🖼️"} {file.name}
              </label>
            )}
          </li>
        ))}
      </ul>
      {nextPage && <button type="button" disabled={loading} onClick={() => void more()}>Cargar más</button>}
      {selected.length > 0 && <div><p role="status">{selected.length} archivo(s) seleccionado(s). Importación inicial: imágenes de hasta 10 MB.</p><button type="button" disabled={importing || loading} onClick={() => void importSelected()}>{importing ? "Importando…" : "Añadir al contenido"}</button></div>}
    </section>
  );
}
