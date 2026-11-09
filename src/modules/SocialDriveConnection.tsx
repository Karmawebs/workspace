import { useState } from "react";
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
    <fieldset disabled={busy}>
      <legend>Conexión del proyecto</legend>
      <button type="button" onClick={connect}>
        Conectar cuenta
      </button>
      <button type="button" onClick={() => void run(() => browse([]))}>
        Elegir carpeta
      </button>
      <button
        type="button"
        onClick={() =>
          void run(async () => {
            await driveAction({ projectId, action: "disconnect" });
            setFolders(null);
            setMessage("Cuenta desconectada.");
            onChange();
          })
        }
      >
        Desconectar
      </button>
      {folders && (
        <div>
          <p>{["Mi unidad", ...path.map((f) => f.name)].join(" / ")}</p>
          {path.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => void run(() => browse(path.slice(0, -1)))}
              >
                Subir un nivel
              </button>
              <button
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
                    onChange();
                  })
                }
              >
                Vincular esta carpeta
              </button>
            </>
          )}
          {folders.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => void run(() => browse([...path, f]))}
            >
              {f.name}
            </button>
          ))}
          {next && (
            <button
              type="button"
              onClick={() => void run(() => browse(path, next))}
            >
              Más carpetas
            </button>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
