import { useEffect, useId, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Folder,
  Link2,
  Plug,
  Unplug,
} from "lucide-react";
import { db } from "../lib/supabase";

type Folder = { id: string; name: string };
type DriveStatus = {
  status: "connected" | "disconnected" | "reauthorization_required";
  account: { name: string; email: string | null } | null;
  folder: { id: string; name: string | null } | null;
  canChoose: boolean;
};
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
  showStatus = false,
}: {
  projectId: string;
  onChange: () => void;
  showStatus?: boolean;
}) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [path, setPath] = useState<Folder[]>([]);
  const [next, setNext] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(showStatus);
  const panelId = useId();
  const [status, setStatus] = useState<DriveStatus>();
  const [statusError, setStatusError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!showStatus) return;
    let active = true;
    async function refresh() {
      try {
        const result = await driveAction<DriveStatus>({
          projectId,
          action: "status",
        });
        if (active) {
          setStatus(result);
          setStatusError("");
        }
      } catch (cause) {
        if (active)
          setStatusError(
            cause instanceof Error
              ? cause.message
              : "No se pudo consultar Drive.",
          );
      }
    }
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      window.removeEventListener("focus", focus);
    };
  }, [projectId, showStatus, revision]);
  const changed = () => {
    setRevision((n) => n + 1);
    onChange();
  };
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
      {showStatus && (
        <div className="social-drive-status">
          {statusError ? (
            <p role="alert">
              {statusError}{" "}
              <button
                type="button"
                className="social-drive-secondary"
                onClick={() => setRevision((n) => n + 1)}
              >
                Reintentar
              </button>
            </p>
          ) : !status ? (
            <p role="status">Consultando conexión de Drive…</p>
          ) : (
            <>
              <p>
                <strong>
                  {status.status === "connected"
                    ? "Cuenta vinculada"
                    : status.status === "reauthorization_required"
                      ? "Requiere autorización"
                      : "Sin conectar"}
                </strong>
              </p>
              {status.account && (
                <p>{status.account.email || status.account.name}</p>
              )}
              <p>
                {status.folder ? (
                  <>
                    Carpeta:{" "}
                    <strong>
                      {status.folder.name || "Carpeta del proyecto"}
                    </strong>
                  </>
                ) : (
                  "Sin carpeta asignada"
                )}
              </p>
              {status.folder && (
                <a
                  className="social-drive-secondary"
                  href={
                    "https://drive.google.com/drive/folders/" +
                    encodeURIComponent(status.folder.id)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={15} aria-hidden="true" /> Abrir carpeta en
                  Drive
                </a>
              )}
              <button
                className="social-drive-secondary"
                type="button"
                onClick={() => setRevision((n) => n + 1)}
              >
                Actualizar conexión
              </button>
              {status.status === "connected" && !status.canChoose && (
                <p>Solo quien autorizó esta cuenta puede cambiar la carpeta.</p>
              )}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        className="social-drive-connection-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>
          <Plug size={15} aria-hidden="true" /> Gestionar conexión
        </span>
        <ChevronDown
          size={16}
          className={expanded ? "is-open" : ""}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <fieldset
          id={panelId}
          className="social-drive-connection-panel"
          disabled={busy}
        >
          <legend className="sr-only">Conexión del proyecto</legend>
          <div className="social-drive-connection-buttons">
            <button
              className="social-drive-secondary"
              type="button"
              disabled={showStatus && (!status || !!statusError)}
              onClick={() => {
                if (
                  showStatus &&
                  status?.folder &&
                  !window.confirm(
                    "Reconectar la cuenta elimina la carpeta vinculada. ¿Continuar?",
                  )
                )
                  return;
                connect();
              }}
            >
              <Plug size={15} aria-hidden="true" />{" "}
              {showStatus && status?.status === "connected"
                ? "Reconectar cuenta"
                : "Conectar cuenta"}
            </button>
            <button
              className="social-drive-secondary"
              type="button"
              disabled={
                showStatus &&
                (!status ||
                  !!statusError ||
                  status.status !== "connected" ||
                  !status.canChoose)
              }
              onClick={() => void run(() => browse([]))}
            >
              <Folder size={15} aria-hidden="true" />{" "}
              {showStatus && status?.folder
                ? "Cambiar carpeta"
                : "Elegir carpeta"}
            </button>
            <button
              className="social-drive-danger"
              type="button"
              disabled={
                showStatus &&
                (!status || !!statusError || status.status === "disconnected")
              }
              onClick={() => {
                if (
                  showStatus &&
                  !window.confirm("¿Desconectar Google Drive de este proyecto?")
                )
                  return;
                void run(async () => {
                  await driveAction({ projectId, action: "disconnect" });
                  setFolders(null);
                  setMessage("Cuenta desconectada.");
                  changed();
                });
              }}
            >
              <Unplug size={15} aria-hidden="true" /> Desconectar
            </button>
          </div>
          {folders && (
            <div className="social-drive-folder-picker">
              <p className="social-drive-folder-path">
                {["Mi unidad", ...path.map((f) => f.name)].join(" / ")}
              </p>
              {path.length > 0 && (
                <div className="social-drive-connection-buttons">
                  <button
                    className="social-drive-secondary"
                    type="button"
                    onClick={() => void run(() => browse(path.slice(0, -1)))}
                  >
                    <ChevronLeft size={15} aria-hidden="true" /> Subir un nivel
                  </button>
                  <button
                    className="social-drive-primary"
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await driveAction({
                          projectId,
                          action: "bind",
                          folderId: path.at(-1)?.id,
                        });
                        setFolders(null);
                        setMessage("Carpeta vinculada.");
                        changed();
                      })
                    }
                  >
                    <Link2 size={15} aria-hidden="true" /> Vincular esta carpeta
                  </button>
                </div>
              )}
              <div className="social-drive-folder-list">
                {folders.map((f) => (
                  <button
                    className="social-drive-folder-choice"
                    type="button"
                    key={f.id}
                    onClick={() => void run(() => browse([...path, f]))}
                  >
                    <Folder size={16} aria-hidden="true" />{" "}
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
              {next && (
                <button
                  className="social-drive-secondary"
                  type="button"
                  onClick={() => void run(() => browse(path, next))}
                >
                  Más carpetas
                </button>
              )}
            </div>
          )}
        </fieldset>
      )}
      {message && (
        <p role="status" className="social-drive-connection-message">
          {message}
        </p>
      )}
    </div>
  );
}
