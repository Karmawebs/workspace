import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { db } from "../lib/supabase";
import { message } from "./data";
export type Membership = {
  workspace_id: string;
  user_id: string;
  role: string;
  name: string;
};
const Context = createContext<{
  session: Session;
  membership: Membership;
  memberships: Membership[];
  select: (id: string) => void;
  signOut: () => Promise<void>;
} | null>(null);
export function useAuth() {
  const c = useContext(Context);
  if (!c) throw new Error("Se necesita una sesión autorizada");
  return c;
}
export function Auth({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [memberships, setMemberships] = useState<Membership[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    db.auth.getSession().then(({ data, error }) => {
      if (alive) {
        if (error) setError(error.message);
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY")
        window.location.hash = "/reset-password";
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (!session) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    (async () => {
      const { data, error } = await db
        .from("kw_workspace_members")
        .select("workspace_id,user_id,role,kw_workspaces(name)")
        .eq("user_id", session.user.id);
      if (error) throw error;
      if (alive) {
        const rows = (data || []).map((r) => ({
          ...r,
          name: r.kw_workspaces?.name || "Workspace",
        }));
        setMemberships(rows);
        setSelected((old) =>
          rows.some((r) => r.workspace_id === old)
            ? old
            : rows[0]?.workspace_id || "",
        );
      }
    })()
      .catch((e) => alive && setError(message(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [session?.user.id, revision]);
  async function signOut() {
    const { error } = await db.auth.signOut();
    if (error) {
      setError(error.message);
      return;
    }
    setSession(null);
    setMemberships([]);
  }
  if (loading)
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Karma Workspace</h1>
          <p role="status">Comprobando acceso…</p>
        </div>
      </div>
    );
  if (!session) return <Login externalError={error} />;
  const membership = memberships.find(
    (r) => r.workspace_id === selected && r.user_id === session.user.id,
  );
  if (!membership)
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <span className="eyebrow">KARMA WORKSPACE</span>
          <h1>
            {error ? "No se pudo verificar el acceso" : "Tu cuenta está lista"}
          </h1>
          <p>
            {error ||
              "Todavía no perteneces a ningún Workspace. Un administrador debe añadir tu cuenta antes de que puedas acceder."}
          </p>
          <p className="muted">{session.user.email}</p>
          <code>{session.user.id}</code>
          <button onClick={() => setRevision((x) => x + 1)}>
            Comprobar acceso
          </button>
          <button className="ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  return (
    <Context.Provider
      value={{ session, membership, memberships, select: setSelected, signOut }}
    >
      {children}
    </Context.Provider>
  );
}
function Login({ externalError }: { externalError: string }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")),
      password = String(f.get("password"));
    try {
      if (mode === "login") {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice(
          "Revisa tu correo para confirmar la cuenta. Un administrador deberá darte acceso al Workspace.",
        );
      } else {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/#/reset-password",
        });
        if (error) throw error;
        setNotice(
          "Si la cuenta existe, recibirás un enlace para restablecer tu contraseña.",
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-intro">
        <div className="brand-mark">K</div>
        <span className="eyebrow">TRABAJO / PROYECTOS</span>
        <h1>
          Todo tu trabajo.
          <br />
          Un mismo espacio.
        </h1>
        <p>Proyectos, personas e ideas conectados.</p>
        <div className="app-pills">
          <span>Work</span>
          <span>Social</span>
          <span>Care</span>
        </div>
      </div>
      <div className="card auth-card">
        <span className="eyebrow">KARMA WORKSPACE</span>
        <h2>
          {mode === "login"
            ? "Bienvenido de nuevo"
            : mode === "signup"
              ? "Crea tu cuenta"
              : "Recupera tu acceso"}
        </h2>
        <p className="muted">
          {mode === "signup"
            ? "Crear una cuenta no concede acceso al Workspace."
            : "Entra a tu espacio de trabajo."}
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {mode !== "reset" && (
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={8}
                required
              />
            </label>
          )}
          {(error || externalError) && (
            <p className="error" role="alert">
              {error || externalError}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <button disabled={busy}>
            {busy
              ? "Un momento…"
              : mode === "login"
                ? "Entrar"
                : mode === "signup"
                  ? "Crear cuenta"
                  : "Enviar enlace"}
          </button>
        </form>
        <button
          className="ghost"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setNotice("");
            setError("");
          }}
        >
          {mode === "login" ? "Crear una cuenta" : "Volver a iniciar sesión"}
        </button>
        {mode === "login" && (
          <button className="ghost" onClick={() => setMode("reset")}>
            He olvidado mi contraseña
          </button>
        )}
      </div>
    </div>
  );
}
export function ResetPassword() {
  const [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <form
        className="card auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await db.auth.updateUser({
            password: String(new FormData(e.currentTarget).get("password")),
          });
          setError(error?.message || "");
          setDone(!error);
          setBusy(false);
        }}
      >
        <h1>Nueva contraseña</h1>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {done ? (
          <a href="#/work/projects">Contraseña actualizada. Ir al Workspace</a>
        ) : (
          <button disabled={busy}>Guardar contraseña</button>
        )}
      </form>
    </div>
  );
}
