import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
// Verification only happens after a deliberate click: email scanners cannot
// consume the token by visiting the URL. The fragment never reaches HTTP logs.
export function PortalInvitation({
  auth,
  token,
  done,
}: {
  auth: SupabaseClient;
  token: string;
  done: () => void;
}) {
  const [verified, setVerified] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const password = String(new FormData(e.currentTarget).get("password"));
    try {
      if (!verified) {
        const { data, error } = await auth.auth.verifyOtp({
          token_hash: token,
          type: "recovery",
        });
        if (error || data.user?.role !== "kw_portal_client")
          throw Error(
            "El enlace ha caducado o ya se ha utilizado. Solicita una nueva invitación al equipo.",
          );
        setVerified(true);
      }
      const { error } = await auth.auth.updateUser({ password });
      if (error)
        throw Error(
          "No se pudo guardar la contraseña. Utiliza al menos 12 caracteres y vuelve a intentarlo.",
        );
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="client-portal">
      <form className="portal-login portal-login-minimal portal-invitation-minimal" onSubmit={submit}>
        <img src="/assets/karma-compact.png" alt="Karma" />
        <h1>Bienvenido a tu espacio</h1>
        <p className="portal-invitation-description">Crea una contraseña para activar tu acceso al proyecto.</p>
        <label className="portal-login-field">
          <span className="portal-sr-only">Nueva contraseña</span>
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Nueva contraseña (mínimo 12 caracteres)"
            aria-label="Nueva contraseña"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="portal-login-submit" disabled={busy}>
          {busy ? "Guardando…" : "Establecer contraseña"}
        </button>
        <a className="portal-invitation-back" href="/portal">Volver al acceso</a>
      </form>
    </div>
  );
}
