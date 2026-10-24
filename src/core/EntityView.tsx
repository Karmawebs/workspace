import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Pencil,
  Archive,
  Trash2,
  Search,
  ExternalLink,
} from "lucide-react";
import { entity, type EntityKey } from "./entities";
import { useRows } from "./useRows";
import { message, removeRow, saveRow, type Scope } from "./data";
import { newLabel, dateLabel, pretty, safeUrl, text, type Row } from "./model";
import { Editor } from "./Editor";
export function EntityView({
  kind,
  scope,
  projectId,
  compact = false,
  extra,
}: {
  kind: EntityKey;
  scope: Scope;
  projectId?: string;
  compact?: boolean;
  extra?: (row: Row) => ReactNode;
}) {
  const def = entity(kind),
    { rows, loading, error, reload } = useRows(def, scope, projectId),
    [edit, setEdit] = useState<Row | null | undefined>(),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [projectFilter, setProjectFilter] = useState("");
  const visible = rows.filter(
    (r) =>
      (!def.archive || !!r.archived === archived) &&
      (!status || r.status === status) &&
      (!projectFilter ||
        (projectFilter === "none"
          ? !r.project_id
          : r.project_id === projectFilter)) &&
      [r[def.primary], r.description, r.body, r.company].some((v) =>
        text(v).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
  );
  async function archive(row: Row) {
    setBusy(true);
    setFailure("");
    try {
      await saveRow(def, scope, { archived: !row.archived }, row, projectId);
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: Row) {
    if (
      !window.confirm(
        `¿Eliminar “${text(row[def.primary])}”? ${kind === "projects" ? "Se eliminarán también sus tareas, eventos, diario, recursos y contenido. Puedes archivar el proyecto para conservarlos." : "Esta acción no se puede deshacer."}`,
      )
    )
      return;
    setBusy(true);
    setFailure("");
    try {
      await removeRow(def, scope, row);
      reload();
    } catch (e) {
      setFailure(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={compact ? "card section-card" : "entity-page"}>
      <header className="section-header">
        <div>
          {!compact && (
            <span className="eyebrow">
              TU ESPACIO DE {scope.app.toUpperCase()}
            </span>
          )}
          <h2>
            {def.title} <span className="count">{visible.length}</span>
          </h2>
          {!compact && (
            <p className="muted">
              {kind === "projects"
                ? "Una vista clara de lo que está en marcha."
                : kind === "clients"
                  ? "Tus relaciones, compartidas entre Work, Social y Care."
                  : kind === "tasks"
                    ? "Organiza el siguiente paso de tu trabajo."
                    : "Todo lo que necesitas, en un mismo lugar."}
            </p>
          )}
        </div>
        <button onClick={() => setEdit(null)}>
          <Plus size={16} />
          {compact ? "Añadir" : newLabel(def.singular)}
        </button>
      </header>
      <div className="filters">
        <label className="search">
          <Search size={16} />
          <input
            aria-label={`Buscar en ${def.title}`}
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {def.fields.some((f) => f.key === "status") && (
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {def.fields
              .find((f) => f.key === "status")
              ?.options?.map((s) => (
                <option key={s} value={s}>
                  {pretty(s)}
                </option>
              ))}
          </select>
        )}
        {kind === "tasks" && !projectId && (
          <select
            aria-label="Tipo de tarea"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">Todas las tareas</option>
            <option value="none">Independientes</option>
          </select>
        )}
        {def.archive && (
          <label className="check">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />
            Archivados
          </label>
        )}
      </div>
      {(error || failure) && (
        <div className="error" role="alert">
          {error || failure}
          <button className="ghost" onClick={reload}>
            Reintentar
          </button>
        </div>
      )}
      {loading ? (
        <p className="empty" role="status">
          Cargando…
        </p>
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="empty-symbol">◇</div>
          <h3>{rows.length ? "Sin resultados" : "Todo empieza aquí"}</h3>
          <p>
            {rows.length
              ? "Prueba con otros filtros."
              : `Crea ${["tarea", "entrada", "alerta", "conexión"].includes(def.singular) ? "una" : "un"} ${def.singular} para empezar.`}
          </p>
        </div>
      ) : (
        <div className={kind === "projects" ? "project-grid" : "record-list"}>
          {visible.map((row) => (
            <article
              className={kind === "projects" ? "card project-card" : "record"}
              key={row.id}
            >
              <div className="record-main">
                <div className="record-title">
                  {kind === "projects" ? (
                    <Link
                      to={`/${scope.app}/projects/${row.id}`}
                      className="project-link"
                    >
                      {text(row[def.primary])}
                    </Link>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => setEdit(row)}
                    >
                      {text(row[def.primary]) || "Sin título"}
                    </button>
                  )}
                  {row.status ? (
                    <span className={`badge ${text(row.status)}`}>
                      {pretty(row.status)}
                    </span>
                  ) : null}
                </div>
                {row.description ||
                row.body ||
                row.message ||
                row.company ||
                row.subtitle ? (
                  <p className="record-description">
                    {text(
                      row.description ||
                        row.body ||
                        row.message ||
                        row.company ||
                        row.subtitle,
                    )}
                  </p>
                ) : null}
                <div className="record-meta">
                  {[
                    row.due_date,
                    row.due_at,
                    row.starts_at,
                    row.entry_date,
                    row.scheduled_at,
                  ]
                    .filter(Boolean)
                    .slice(0, 1)
                    .map((d, i) => (
                      <span key={i}>{dateLabel(d)}</span>
                    ))}
                  {row.priority ? <span>{pretty(row.priority)}</span> : null}
                  {row.channel ? <span>{text(row.channel)}</span> : null}
                  {row.email ? (
                    <a href={`mailto:${text(row.email)}`}>{text(row.email)}</a>
                  ) : null}
                  {safeUrl(row.url || row.website || row.endpoint) ? (
                    <a
                      href={safeUrl(row.url || row.website || row.endpoint)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir enlace <ExternalLink size={12} />
                    </a>
                  ) : null}
                  {row.secret_ref ? (
                    <span>Referencia: {text(row.secret_ref)}</span>
                  ) : null}
                </div>
                {extra?.(row)}
              </div>
              <div className="record-actions">
                <button
                  className="icon-button"
                  title="Editar"
                  aria-label={`Editar ${text(row[def.primary])}`}
                  onClick={() => setEdit(row)}
                >
                  <Pencil size={15} />
                </button>
                {def.archive && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    title={row.archived ? "Restaurar" : "Archivar"}
                    aria-label={row.archived ? "Restaurar" : "Archivar"}
                    onClick={() => archive(row)}
                  >
                    <Archive size={15} />
                  </button>
                )}
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={`Eliminar ${text(row[def.primary])}`}
                  title="Eliminar"
                  onClick={() => remove(row)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {rows.length === 1000 && (
        <p className="muted">
          Se muestran los primeros 1.000 registros. Acota por proyecto.
        </p>
      )}
      {edit !== undefined && (
        <Editor
          def={def}
          scope={scope}
          original={edit || undefined}
          projectId={projectId}
          onClose={() => setEdit(undefined)}
          onSave={() => {
            setEdit(undefined);
            reload();
          }}
        />
      )}
    </section>
  );
}
