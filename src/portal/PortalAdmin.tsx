import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  UsersRound,
  MessagesSquare,
  KeyRound,
  Plus,
  X,
  Copy,
  Eye,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { db } from "../lib/supabase";
import "./portal-admin.css";

type Access = {
  user_id: string;
  name: string;
  contact_email: string;
  login_email: string;
  active: boolean;
};
type Activity = {
  id: string;
  event: "changes" | "approved" | "pending" | "reply";
  title: string | null;
  client: string | null;
  comment: string;
  created_at: string;
  parent_id: string | null;
};
type Credential = {
  id: string;
  service: string;
  visible: boolean;
  username: string;
};
type Listing = {
  access: Access[];
  history: Activity[];
  credentials: Credential[];
};
type Dialog =
  | { kind: "create" }
  | { kind: "access" | "edit" | "reset"; user: Access }
  | { kind: "activity"; item: Activity }
  | { kind: "credential"; record?: Credential; readonly?: boolean };
const labels = {
  changes: "Cambios solicitados",
  approved: "Aprobado",
  pending: "Pendiente",
  reply: "Respuesta",
};
const tones = {
  changes: "danger",
  approved: "active",
  pending: "pending",
  reply: "",
};
const date = (s: string) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s));
const fields = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
const Badge = ({ text, tone = "" }: { text: string; tone?: string }) => (
  <span className={"badge pa-badge " + tone}>{text}</span>
);
function Card({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card pa-card">
      <header>
        <span className="pa-icon">{icon}</span>
        <h3>{title}</h3>
        {count !== undefined && (
          <span className="badge" aria-label={count + " registros"}>
            {count}
          </span>
        )}
        {action}
      </header>
      {children}
    </section>
  );
}
function Modal({
  title,
  close,
  busy,
  children,
}: {
  title: string;
  close: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="editor pa-modal"
      aria-labelledby="pa-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">PORTAL DE CLIENTES</span>
          <h2 id="pa-title">{title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function PortalAdmin({
  projectId,
  workspaceId,
}: {
  projectId?: string;
  workspaceId: string;
}) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [choice, choose] = useState(""),
    [error, err] = useState("");
  useEffect(() => {
    let live = true;
    if (!projectId)
      db.from("kw_projects")
        .select("id,name")
        .eq("workspace_id", workspaceId)
        .eq("app_key", "social")
        .order("name")
        .then(({ data, error }) => {
          if (live) {
            if (error) err("No se pudieron cargar los proyectos.");
            setProjects(data || []);
            choose(data?.[0]?.id || "");
          }
        });
    return () => {
      live = false;
    };
  }, [projectId, workspaceId]);
  return (
    <div className="pa-stack">
      {!projectId && (
        <label className="pa-picker">
          Proyecto
          <select value={choice} onChange={(e) => choose(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {(projectId || choice) && (
        <Controls key={projectId || choice} id={projectId || choice} />
      )}
    </div>
  );
}
async function invoke<T>(
  id: string,
  body: Record<string, unknown>,
): Promise<T> {
  const r = await db.functions.invoke("social-portal-admin", {
    body: { ...body, projectId: id },
  });
  if (r.error)
    throw Error(
      "No se pudo completar la operación. Comprueba los datos e inténtalo de nuevo.",
    );
  return r.data;
}
function Controls({ id }: { id: string }) {
  const [data, set] = useState<Listing>(),
    [modal, open] = useState<Dialog | null>(null),
    [error, err] = useState(""),
    [notice, tell] = useState(""),
    [busy, lock] = useState(false);
  const [attempt, reload] = useState(0);
  useEffect(() => {
    let live = true;
    invoke<Listing>(id, { action: "list" })
      .then((r) => {
        if (live) set(r);
      })
      .catch((e) => {
        if (live) err(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  function show(m: Dialog | null) {
    err("");
    tell("");
    open(m);
  }
  async function act(body: Record<string, unknown>, message: string) {
    if (busy) return;
    lock(true);
    err("");
    try {
      const result = await invoke<{ login?: string }>(id, body);
      open(null);
      tell(
        result.login
          ? "Acceso creado. Correo de acceso: " + result.login
          : message,
      );
      reload((n) => n + 1);
    } catch (e) {
      err((e as Error).message);
    } finally {
      lock(false);
    }
  }
  const empty = (text: string) => (
    <p className="pa-empty">
      {!data ? (error ? "Listado no disponible." : "Cargando…") : text}
    </p>
  );
  const add = (text: string, dialog: Dialog) => (
    <button className="pa-add" onClick={() => show(dialog)}>
      <Plus size={15} />
      {text}
    </button>
  );
  const problem = error && (
    <p className="error" role="alert">
      {error}{" "}
      {!modal && (
        <button
          className="text-button"
          onClick={() => {
            err("");
            reload((n) => n + 1);
          }}
        >
          Reintentar
        </button>
      )}
    </p>
  );
  const title =
    modal?.kind === "create"
      ? "Añadir cliente"
      : modal?.kind === "access"
        ? "Gestionar acceso"
        : modal?.kind === "edit"
          ? "Editar contacto"
          : modal?.kind === "reset"
            ? "Restablecer contraseña"
            : modal?.kind === "activity"
              ? labels[modal.item.event]
              : modal?.kind === "credential"
                ? modal.readonly
                  ? "Consultar credencial"
                  : modal.record
                    ? "Editar credencial"
                    : "Añadir credencial"
                : "";
  return (
    <>
      {!modal && problem}
      {!modal && notice && (
        <p className="pa-notice" role="status">
          {notice}
        </p>
      )}
      <Card
        title="Accesos de clientes"
        icon={<UsersRound />}
        count={data?.access.length}
        action={add("Añadir cliente", { kind: "create" })}
      >
        {data?.access.length
          ? data.access.map((a) => (
              <div className="pa-row" key={a.user_id}>
                <div className="record-main">
                  <button
                    className="text-button"
                    onClick={() => show({ kind: "access", user: a })}
                  >
                    {a.name}
                  </button>
                  <small>{a.login_email}</small>
                </div>
                <Badge
                  text={a.active ? "Activo" : "Desactivado"}
                  tone={a.active ? "active" : ""}
                />
                <button
                  className="secondary"
                  onClick={() => show({ kind: "access", user: a })}
                >
                  Gestionar
                  <ChevronRight size={14} />
                </button>
              </div>
            ))
          : empty("Todavía no hay clientes con acceso a este proyecto.")}
      </Card>
      <Card
        title="Avisos y aprobaciones"
        icon={<MessagesSquare />}
        count={data?.history.length}
      >
        {data?.history.length
          ? data.history.map((h) => (
              <div className="pa-row" key={h.id}>
                <div className="record-main">
                  <strong>{h.title || "Publicación no disponible"}</strong>
                  <small>
                    {h.event === "reply"
                      ? "Respuesta del equipo"
                      : h.client || "Actividad del proyecto"}{" "}
                    · {date(h.created_at)}
                  </small>
                </div>
                <Badge text={labels[h.event]} tone={tones[h.event]} />
                <button
                  className="icon-button"
                  aria-label={"Consultar " + labels[h.event]}
                  onClick={() => show({ kind: "activity", item: h })}
                >
                  <Eye size={17} />
                </button>
              </div>
            ))
          : empty("Las solicitudes de cambios y aprobaciones aparecerán aquí.")}
      </Card>
      <Card
        title="Credenciales"
        icon={<KeyRound />}
        count={data?.credentials.length}
        action={add("Añadir credencial", { kind: "credential" })}
      >
        {data?.credentials.length
          ? data.credentials.map((c) => (
              <div className="pa-row" key={c.id}>
                <div className="record-main">
                  <strong>{c.service}</strong>
                  <small>{c.username || "Sin usuario registrado"}</small>
                </div>
                <Badge text={c.visible ? "Compartida" : "Privada"} />
                <div className="record-actions">
                  <button
                    className="icon-button"
                    aria-label={"Consultar " + c.service}
                    onClick={() =>
                      show({ kind: "credential", record: c, readonly: true })
                    }
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Editar " + c.service}
                    onClick={() => show({ kind: "credential", record: c })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={"Eliminar " + c.service}
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        "¿Eliminar la credencial de " + c.service + "?",
                      ) &&
                      act(
                        { action: "credential", op: "delete", id: c.id },
                        "Credencial eliminada.",
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          : empty("No hay credenciales guardadas en este proyecto.")}
      </Card>
      {modal && (
        <Modal title={title} close={() => show(null)} busy={busy}>
          {problem}
          {notice && <p className="pa-notice" role="status">{notice}</p>}
          {modal.kind === "access" && (
            <>
              <h3>{modal.user.name}</h3>
              <Badge
                text={modal.user.active ? "Activo" : "Desactivado"}
                tone={modal.user.active ? "active" : ""}
              />
              <dl>
                <dt>Correo de acceso</dt>
                <dd>
                  {modal.user.login_email}{" "}
                  <button
                    className="icon-button"
                    aria-label="Copiar correo de acceso"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(modal.user.login_email)
                        .then(() => tell("Correo copiado."))
                        .catch(() => err("No se pudo copiar el correo."))
                    }
                  >
                    <Copy size={15} />
                  </button>
                </dd>
                <dt>Correo de contacto</dt>
                <dd>{modal.user.contact_email}</dd>
              </dl>
              <footer>
                <button
                  className="secondary"
                  onClick={() => show({ kind: "reset", user: modal.user })}
                >
                  Restablecer contraseña
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !modal.user.active ||
                      confirm(
                        "¿Desactivar el acceso de " + modal.user.name + "?",
                      )
                    )
                      act(
                        {
                          action: "active",
                          id: modal.user.user_id,
                          active: !modal.user.active,
                        },
                        "Estado actualizado.",
                      );
                  }}
                >
                  {modal.user.active ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => show({ kind: "edit", user: modal.user })}
                >
                  Editar contacto
                </button>
              </footer>
            </>
          )}
          {(["create", "edit", "reset"] as string[]).includes(modal.kind) && (
            <form
              key={modal.kind}
              onSubmit={(e) => {
                const f = fields(e);
                if (
                  modal.kind === "reset" &&
                  !confirm("¿Sustituir la contraseña actual?")
                )
                  return;
                act(
                  {
                    ...f,
                    action: modal.kind,
                    id: "user" in modal ? modal.user.user_id : undefined,
                  },
                  modal.kind === "reset"
                    ? "Contraseña restablecida."
                    : "Contacto actualizado.",
                );
              }}
            >
              <div className="form-fields">
                {modal.kind !== "reset" && (
                  <>
                    <label>
                      Nombre
                      <input
                        name="name"
                        required
                        maxLength={150}
                        defaultValue={
                          modal.kind === "edit" ? modal.user.name : ""
                        }
                      />
                    </label>
                    <label>
                      Correo de contacto
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={
                          modal.kind === "edit" ? modal.user.contact_email : ""
                        }
                      />
                    </label>
                  </>
                )}
                {modal.kind !== "edit" && (
                  <label>
                    {modal.kind === "reset"
                      ? "Nueva contraseña"
                      : "Contraseña inicial"}
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                    />
                    <small>Mínimo 12 caracteres.</small>
                  </label>
                )}
              </div>
              <footer>
                <button disabled={busy}>
                  {modal.kind === "create"
                    ? "Crear acceso"
                    : modal.kind === "reset"
                      ? "Restablecer contraseña"
                      : "Guardar cambios"}
                </button>
              </footer>
            </form>
          )}
          {modal.kind === "activity" && (
            <>
              <h3>{modal.item.title || "Publicación no disponible"}</h3>
              <p className="muted">
                {modal.item.client || "Actividad del proyecto"} ·{" "}
                {date(modal.item.created_at)}
              </p>
              <p className="pa-comment">
                {modal.item.comment || labels[modal.item.event]}
              </p>
              {data?.history
                .filter((h) => h.parent_id === modal.item.id)
                .map((h) => (
                  <div key={h.id} className="pa-comment">
                    <small>Respuesta · {date(h.created_at)}</small>
                    <p>{h.comment}</p>
                  </div>
                ))}
              {modal.item.event === "changes" && (
                <form
                  onSubmit={(e) =>
                    act(
                      {
                        ...fields(e),
                        action: "reply",
                        parent: modal.item.id,
                        request: crypto.randomUUID(),
                      },
                      "Respuesta registrada.",
                    )
                  }
                >
                  <label>
                    Respuesta
                    <textarea name="comment" required maxLength={4000} />
                  </label>
                  <footer>
                    <button disabled={busy}>Responder</button>
                  </footer>
                </form>
              )}
            </>
          )}
          {modal.kind === "credential" && (
            <CredentialForm
              key={(modal.record?.id || "new") + modal.readonly}
              project={id}
              record={modal.record}
              readonly={modal.readonly}
              busy={busy}
              save={act}
            />
          )}
        </Modal>
      )}
    </>
  );
}
function CredentialForm({
  project,
  record,
  readonly,
  busy,
  save,
}: {
  project: string;
  record?: Credential;
  readonly?: boolean;
  busy: boolean;
  save: (b: Record<string, unknown>, msg: string) => void;
}) {
  const [value, set] = useState<Record<string, string> | null>(
      record ? null : {},
    ),
    [error, err] = useState(""),
    [visible, unmask] = useState(false);
  useEffect(() => {
    let live = true;
    if (record)
      invoke<{ value: Record<string, string> }>(project, {
        action: "credential",
        op: "reveal",
        id: record.id,
      })
        .then((r) => {
          if (live) set(r.value);
        })
        .catch((e) => {
          if (live) err(e.message);
        });
    return () => {
      live = false;
    };
  }, [project, record]);
  if (!value)
    return (
      <p role={error ? "alert" : "status"}>{error || "Cargando credencial…"}</p>
    );
  return (
    <form
      onSubmit={(e) => {
        const { service, shared, ...value } = fields(e);
        if (!readonly)
          save(
            {
              action: "credential",
              op: record ? "update" : "create",
              id: record?.id || crypto.randomUUID(),
              service,
              visible: shared === "on",
              value,
            },
            "Credencial guardada.",
          );
      }}
    >
      <div className="form-fields">
        <label>
          Servicio
          <input
            name="service"
            required
            readOnly={readonly}
            defaultValue={record?.service}
          />
        </label>
        <label>
          Usuario o correo
          <input
            name="username"
            readOnly={readonly}
            defaultValue={value.username}
          />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            autoComplete="new-password"
            type={visible ? "text" : "password"}
            readOnly={readonly}
            defaultValue={value.password}
          />
        </label>
        <button
          className="text-button"
          type="button"
          onClick={() => unmask(!visible)}
        >
          {visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        </button>
        <label>
          URL
          <input name="url" readOnly={readonly} defaultValue={value.url} />
        </label>
        <label>
          Notas
          <textarea
            name="notes"
            readOnly={readonly}
            defaultValue={value.notes}
          />
        </label>
        <label className="check">
          <input
            name="shared"
            type="checkbox"
            disabled={readonly}
            defaultChecked={record?.visible}
          />{" "}
          Visible para el cliente
        </label>
      </div>
      {!readonly && (
        <footer>
          <button disabled={busy}>Guardar</button>
        </footer>
      )}
    </form>
  );
}
