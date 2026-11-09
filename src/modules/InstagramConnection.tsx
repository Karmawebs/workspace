import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
const pendingKey = "kw-instagram-pending";
const errors: Record<string, string> = {
  INVALID_CALLBACK:
    "La autorización ha caducado o ya se utilizó. Inicia una nueva conexión.",
  FORBIDDEN: "Necesitas permisos de administración en este proyecto.",
  SELECT_ONE_ACCOUNT:
    "Selecciona una sola cuenta profesional de Instagram en Meta.",
  REAUTHORIZE: "La autorización ha caducado. Vuelve a conectar Instagram.",
  INCOMPLETE_CONSENT:
    "Faltan permisos de Instagram. Revisa el consentimiento en Meta.",
  UNEXPECTED_PERMISSIONS:
    "La configuración de Meta incluye permisos adicionales. Revisa la configuración de la aplicación.",
  META_UNAVAILABLE: "Meta no pudo validar esta solicitud. Vuelve a intentarlo.",
};
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.functions.invoke<T>("social-instagram", {
    body,
  });
  if (error || !data) {
    const detail = await error?.context?.json?.().catch(() => null);
    throw new Error(
      errors[detail?.error] ??
        "No se pudo completar la operación de Instagram.",
    );
  }
  return data;
}
export function InstagramActions({
  projectId,
  connectionId,
  reload,
}: {
  projectId: string;
  connectionId?: string;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function run(action: "start" | "disconnect" | "check") {
    setBusy(action);
    setError("");
    try {
      if (action === "start") {
        const { state, url } = await invoke<{ state: string; url: string }>({
          action,
          projectId,
        });
        sessionStorage.setItem(
          pendingKey,
          JSON.stringify({ state, projectId }),
        );
        location.assign(url);
        return;
      }
      await invoke({ action, projectId, connectionId });
      setConfirm(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    }
    setBusy("");
  }
  return (
    <div>
      {connectionId && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run("check")}
        >
          Comprobar autorización
        </button>
      )}
      <button type="button" disabled={!!busy} onClick={() => void run("start")}>
        {busy === "start"
          ? "Conectando…"
          : connectionId
            ? "Volver a autorizar"
            : "Conectar"}
      </button>
      {connectionId && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => setConfirm(true)}
        >
          Desconectar
        </button>
      )}
      {confirm && (
        <p>
          ¿Desconectar esta cuenta del proyecto?{" "}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("disconnect")}
          >
            Sí, desconectar
          </button>{" "}
          <button type="button" onClick={() => setConfirm(false)}>
            Cancelar
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function InstagramCallback({ params }: { params: URLSearchParams }) {
  const [message, setMessage] = useState("Comprobando autorización…");
  const [done, setDone] = useState(false);
  useEffect(() => {
    async function finish() {
      const saved = sessionStorage.getItem(pendingKey);
      sessionStorage.removeItem(pendingKey);
      const pending = saved ? JSON.parse(saved) : null;
      if (!pending?.state || pending.state !== params.get("state"))
        throw new Error(errors.INVALID_CALLBACK);
      if (params.has("error"))
        throw new Error(
          "Autorización cancelada. Puedes volver a conectar Instagram desde el proyecto.",
        );
      const code = params.get("code");
      if (!code) throw new Error(errors.INVALID_CALLBACK);
      await invoke({
        action: "finish",
        projectId: pending.projectId,
        state: pending.state,
        code,
      });
      setMessage("Cuenta de Instagram conectada.");
    }
    finish()
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : "Error de autorización."),
      )
      .finally(() => setDone(true));
  }, [params]);
  return (
    <main className="auth-page">
      <section className="card auth-card">
        <h1>Instagram</h1>
        <p role="status">{message}</p>
        {done && <a href="/#/social/connections">Volver a Conexiones</a>}
      </section>
    </main>
  );
}
