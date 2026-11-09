import { useState } from "react";
import { ChevronDown, ChevronLeft, Folder, Link2, Plug, Unplug } from "lucide-react";
import { db } from "../lib/supabase";

type Folder = { id: string; name: string };
export async function driveAction<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.functions.invoke<T>("social-drive-oauth", {
    body,
  });
  if (error || !data) {
    const reason = await error?.context?.json?.().catch(() => null);
    if (reason?.error === "FORBIDDEN")
      throw new Error(
        "Solo los administradores pueden gestionar Drive. La carpeta debe elegirla quien conectó la cuenta.",
      );
    if (reason?.error === "GOOGLE_REAUTH_REQUIRED")
      throw new Error(
        "La autorización ha caducado. Vuelve a conectar Google Drive.",
      );
    throw new Error(
      "No se pudo completar la operación. Comprueba la conexión y vuelve a intentarlo.",
    );
  }
  return data;
}

export async function finishDrive() {
  const params = new URLSearchParams(location.search);
  history.replaceState(null, "", location.pathname);
  const state = params.get("state");
  const pending = sessionStorage.getItem("social-drive-pending");
  sessionStorage.removeItem("social-drive-pending");
  if (!state || !pending)
    throw new Error(
      "La solicitud ha caducado. Inicia la conexión desde Social.",
    );
  const request = JSON.parse(pending);
  if (state !== request.state || !params.get("code"))
    throw new Error("Autorización cancelada o caducada.");
  await driveAction({
    action: "finish",
    projectId: request.projectId,
    state,
    code: params.get("code"),
  });
  return "Cuenta conectada. Cierra esta ventana y elige la carpeta en Social.";
}

export function SocialDriveConnection({
  projectId,
  onChange,
}: {
  projectId: string;
  onChange: () => void;
}) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [next, setNext] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setBusy(false);
    }
  }
  async function browse(route: Folder[], page?: string) {
    const result = await driveAction<{
      files: Folder[];
      nextPageToken?: string;
    }>({
      projectId,
      action: "folders",
      folderId: route.at(-1)?.id,
      pageToken: page,
    });
    setFolders(page ? [...(folders || []), ...result.files] : result.files);
    setPath(route);
    setNext(result.nextPageToken || "");
  }
  function connect() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setMessage("Permite abrir la ventana de autorización.");
      return;
    }
    popup.opener = null;
    void run(async () => {
      try {
        const { url, state } = await driveAction<{
          url: string;
          state: string;
        }>({ action: "start", projectId });
        popup.sessionStorage.setItem(
          "social-drive-pending",
          JSON.stringify({ projectId, state }),
        );
        popup.location.replace(url);
        setMessage("Tras autorizar la cuenta, elige la carpeta del proyecto.");
      } catch (e) {
        popup.close();
        throw e;
      }
    });
  }
  return (
    <div className="social-drive-connection">
      <button type="button" className="social-drive-connection-toggle" aria-expanded={expanded}
        aria-controls="social-drive-connection-actions" onClick={() => setExpanded((value) => !value)}>
        <span><Plug size={15} aria-hidden="true" /> Gestionar conexión</span>
        <ChevronDown size={16} className={expanded ? "is-open" : ""} aria-hidden="true" />
      </button>
      {expanded && <fieldset id="social-drive-connection-actions" className="social-drive-connection-panel" disabled={busy}>
        <legend className="sr-only">Conexión del proyecto</legend>
        <div className="social-drive-connection-buttons">
          <button className="social-drive-secondary" type="button" onClick={connect}><Plug size={15} aria-hidden="true" /> Conectar cuenta</button>
          <button className="social-drive-secondary" type="button" onClick={() => void run(() => browse([]))}><Folder size={15} aria-hidden="true" /> Elegir carpeta</button>
          <button className="social-drive-danger" type="button" onClick={() => void run(async () => {
            await driveAction({ projectId, action: "disconnect" });
            setFolders(null);
            setMessage("Cuenta desconectada.");
            onChange();
          })}><Unplug size={15} aria-hidden="true" /> Desconectar</button>
        </div>
        {folders && <div className="social-drive-folder-picker">
          <p className="social-drive-folder-path">{["Mi unidad", ...path.map((f) => f.name)].join(" / ")}</p>
          {path.length > 0 && <div className="social-drive-connection-buttons">
            <button className="social-drive-secondary" type="button" onClick={() => void run(() => browse(path.slice(0, -1)))}><ChevronLeft size={15} aria-hidden="true" /> Subir un nivel</button>
            <button className="social-drive-primary" type="button" onClick={() => void run(async () => {
              await driveAction({ projectId, action: "bind", folderId: path.at(-1)?.id });
              setFolders(null);
              setMessage("Carpeta vinculada.");
              onChange();
            })}><Link2 size={15} aria-hidden="true" /> Vincular esta carpeta</button>
          </div>}
          <div className="social-drive-folder-list">{folders.map((f) => (
            <button className="social-drive-folder-choice" type="button" key={f.id}
              onClick={() => void run(() => browse([...path, f]))}><Folder size={16} aria-hidden="true" /> <span>{f.name}</span></button>
          ))}</div>
          {next && <button className="social-drive-secondary" type="button" onClick={() => void run(() => browse(path, next))}>Más carpetas</button>}
        </div>}
      </fieldset>}
      {message && <p role="status" className="social-drive-connection-message">{message}</p>}
    </div>
  );
}
