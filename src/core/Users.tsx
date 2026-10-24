import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
import { useAuth } from "./Auth";
import { message } from "./data";
import { pretty } from "./model";
export function Users() {
  const { session, membership } = useAuth(),
    [rows, setRows] = useState<
      { user_id: string; role: string; name: string }[]
    >([]),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const admin = ["owner", "admin"].includes(membership.role);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [members, profiles] = await Promise.all([
        db
          .from("kw_workspace_members")
          .select("user_id,role")
          .eq("workspace_id", membership.workspace_id),
        db.from("kw_profiles").select("id,display_name"),
      ]);
      if (members.error || profiles.error)
        throw members.error || profiles.error;
      if (alive) {
        setRows(
          (members.data || []).map((m) => ({
            ...m,
            name:
              profiles.data?.find((p) => p.id === m.user_id)?.display_name ||
              m.user_id,
          })),
        );
        setName(
          profiles.data?.find((p) => p.id === session.user.id)?.display_name ||
            "",
        );
      }
    })().catch((e) => alive && setError(message(e)));
    return () => {
      alive = false;
    };
  }, [membership.workspace_id, session.user.id, revision]);
  return (
    <section>
      <header className="page-heading">
        <div>
          <span className="eyebrow">CORE / PERSONAS</span>
          <h1>Equipo</h1>
          <p className="muted">
            El acceso se concede explícitamente por un administrador.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="card info-panel">
        <h2>Mi perfil</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { error } = await db
              .from("kw_profiles")
              .update({ display_name: name })
              .eq("id", session.user.id)
              .select("id")
              .single();
            setError(error?.message || "");
            if (!error) {
              setNotice("Perfil actualizado");
              setRevision((v) => v + 1);
            }
            setBusy(false);
          }}
        >
          <label>
            Nombre visible
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <button disabled={busy}>Guardar</button>
        </form>
      </div>
      <div className="card info-panel">
        <h2>Miembros del Workspace</h2>
        {rows.map((r) => (
          <div className="record" key={r.user_id}>
            <span>
              {r.name}
              {r.user_id === session.user.id ? " (tú)" : ""}
            </span>
            <span className="badge">{pretty(r.role)}</span>
            {admin && r.user_id !== session.user.id && r.role !== "owner" && (
              <button
                className="ghost danger"
                disabled={busy}
                onClick={async () => {
                  if (!confirm(`¿Retirar el acceso de ${r.name}?`)) return;
                  setBusy(true);
                  const { error } = await db
                    .from("kw_workspace_members")
                    .delete()
                    .eq("workspace_id", membership.workspace_id)
                    .eq("user_id", r.user_id)
                    .select("user_id")
                    .single();
                  setError(error?.message || "");
                  setRevision((v) => v + 1);
                  setBusy(false);
                }}
              >
                Retirar acceso
              </button>
            )}
          </div>
        ))}
        {admin && (
          <form
            className="invite-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              const { error } = await db.from("kw_workspace_members").insert({
                workspace_id: membership.workspace_id,
                user_id: String(f.get("user_id")).trim(),
                role: String(f.get("role")),
              });
              setError(error?.message || "");
              if (!error) {
                setNotice("Miembro añadido");
                setRevision((v) => v + 1);
              }
              setBusy(false);
            }}
          >
            <h3>Añadir una cuenta existente</h3>
            <p className="muted">
              La persona debe crear y confirmar su cuenta primero. Solicita el
              ID que aparece en su pantalla de acceso pendiente.
            </p>
            <label>
              ID de usuario
              <input
                name="user_id"
                required
                pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
              />
            </label>
            <label>
              Rol
              <select name="role">
                <option value="member">Miembro</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <button disabled={busy}>Conceder acceso</button>
          </form>
        )}
      </div>
    </section>
  );
}
