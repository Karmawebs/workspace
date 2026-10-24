import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { db } from "../lib/supabase";
import { type Scope, message, saveRow } from "./data";
import {
  newLabel,
  type Entity,
  type Field,
  type Row,
  dayKey,
  localInput,
  pretty,
  safeUrl,
  text,
} from "./model";
export function Editor({
  def,
  scope,
  original,
  projectId,
  onClose,
  onSave,
}: {
  def: Entity;
  scope: Scope;
  original?: Row;
  projectId?: string;
  onClose: () => void;
  onSave: (row: Row) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [options, setOptions] = useState<
      Record<string, { id: string; name: string }[]>
    >({}),
    [ready, setReady] = useState(false);
  const fields: Field[] = [
    ...(def.project && !projectId
      ? [
          {
            key: "project_id",
            label: "Proyecto",
            type: "select" as const,
            relation: "projects" as const,
            required: def.projectRequired,
          },
        ]
      : []),
    ...def.fields,
  ];
  useEffect(() => {
    dialog.current?.showModal();
    const before = document.activeElement as HTMLElement;
    return () => before?.focus();
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const relations = new Set(fields.map((f) => f.relation).filter(Boolean));
      const result: Record<string, { id: string; name: string }[]> = {};
      await Promise.all(
        [...relations].map(async (relation) => {
          if (relation === "members") {
            const { data, error } = await db
              .from("kw_workspace_members")
              .select("user_id")
              .eq("workspace_id", scope.workspaceId);
            if (error) throw error;
            result.members = (data || []).map((r) => ({
              id: r.user_id,
              name: r.user_id,
            }));
            return;
          }
          const response =
            relation === "projects"
              ? await db
                  .from("kw_projects")
                  .select("id,name")
                  .eq("workspace_id", scope.workspaceId)
                  .eq("app_key", scope.app)
                  .limit(1000)
              : relation === "clients"
                ? await db
                    .from("kw_clients")
                    .select("id,name")
                    .eq("workspace_id", scope.workspaceId)
                    .limit(1000)
                : await db
                    .from("kw_care_sites")
                    .select("id,domain")
                    .eq("workspace_id", scope.workspaceId)
                    .limit(1000);
          if (response.error) throw response.error;
          result[String(relation)] = (response.data || []).map((r) => ({
            id: r.id,
            name: "name" in r ? r.name : r.domain,
          }));
        }),
      );
      if (alive) {
        setOptions(result);
        setReady(true);
      }
    })().catch((e) => alive && setError(message(e)));
    return () => {
      alive = false;
    };
  }, [scope.workspaceId, scope.app]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget),
      values: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = text(form.get(field.key)).trim();
      values[field.key] =
        field.type === "checkbox"
          ? form.has(field.key)
          : field.type === "number"
            ? Number(raw)
            : field.type === "datetime-local"
              ? raw
                ? new Date(raw).toISOString()
                : null
              : raw || null;
      if (field.type === "url" && raw && !safeUrl(raw)) {
        setError("Utiliza una URL http(s) sin credenciales.");
        return;
      }
      if (
        field.relation &&
        raw &&
        !options[field.relation]?.some((o) => o.id === raw)
      ) {
        setError("Selecciona una relación válida del Workspace.");
        return;
      }
    }
    if (
      values.ends_at &&
      values.starts_at &&
      String(values.ends_at) < String(values.starts_at)
    ) {
      setError("El fin no puede ser anterior al inicio.");
      return;
    }
    if (
      values.due_date &&
      values.start_date &&
      String(values.due_date) < String(values.start_date)
    ) {
      setError("La entrega no puede ser anterior al inicio.");
      return;
    }
    if (
      values.legacy_site_id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        text(values.legacy_site_id),
      )
    ) {
      setError("El ID del sitio debe ser un UUID válido.");
      return;
    }
    setBusy(true);
    try {
      const row = await saveRow(def, scope, values, original, projectId);
      onSave(row);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">
              {scope.app.toUpperCase()} / {def.title}
            </span>
            <h2>
              {original ? `Editar ${def.singular}` : newLabel(def.singular)}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="form-fields">
          {fields.map((f) => {
            let value =
              original?.[f.key] ??
              f.default ??
              (f.key === "entry_date" ? dayKey(new Date()) : "");
            if (f.type === "datetime-local") value = localInput(value);
            return (
              <label key={f.key}>
                {f.label}
                {f.required ? " *" : ""}
                {f.type === "textarea" ? (
                  <textarea
                    name={f.key}
                    defaultValue={text(value)}
                    required={f.required}
                    rows={4}
                  />
                ) : f.type === "select" ? (
                  <select
                    name={f.key}
                    defaultValue={text(value)}
                    required={f.required || f.default !== undefined}
                  >
                    <option value="" disabled={f.default !== undefined}>
                      {f.required ? "Seleccionar…" : "Sin asignar"}
                    </option>
                    {f.relation
                      ? (options[f.relation] || []).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))
                      : f.options?.map((o) => (
                          <option key={o} value={o}>
                            {pretty(o)}
                          </option>
                        ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <input
                    name={f.key}
                    type="checkbox"
                    defaultChecked={!!value}
                  />
                ) : (
                  <input
                    name={f.key}
                    type={f.type || "text"}
                    defaultValue={text(value)}
                    required={f.required}
                    maxLength={f.type === "text" || !f.type ? 1000 : undefined}
                  />
                )}
                {f.help && <small>{f.help}</small>}
              </label>
            );
          })}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            className="ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button disabled={busy || !ready}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
