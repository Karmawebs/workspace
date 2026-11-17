import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eye } from "lucide-react";
export type PortalItem = {
  id: string;
  title: string;
  description: string;
  content_type: string;
  calendar_at: string | null;
  created_at: string;
  status: string;
  revision: number;
};
export function directoryItems(
  items: PortalItem[],
  month: Date,
  undated = false,
) {
  return items
    .filter((item) => {
      if (!item.calendar_at) return undated;
      const date = new Date(item.calendar_at);
      return (
        !undated &&
        date.getFullYear() === month.getFullYear() &&
        date.getMonth() === month.getMonth()
      );
    })
    .sort(
      (a, b) =>
        (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) ||
        a.id.localeCompare(b.id),
    );
}
const labels: Record<string, string> = {
  post: "Post",
  reel: "Reel",
  story: "Historia",
  carousel: "Carrusel",
};
export function PortalDirectory({
  items,
  month,
  setMonth,
  busy,
  open,
  approve,
}: {
  items: PortalItem[];
  month: Date;
  setMonth: (date: Date) => void;
  busy: boolean;
  open: (id: string) => void;
  approve: (item: PortalItem) => void;
}) {
  const [undated, setUndated] = useState(false),
    [limit, setLimit] = useState(12);
  useEffect(() => setLimit(12), [month, undated]);
  const rows = directoryItems(items, month, undated),
    withoutDate = items.filter((x) => !x.calendar_at).length;
  function move(delta: number) {
    setUndated(false);
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }
  return (
    <div className="portal-directory">
      <div className="portal-directory-heading">
        <h2>Directorio</h2>
        <nav aria-label="Mes del directorio">
          <button
            aria-label="Mes anterior del directorio"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span aria-live="polite">
            {month.toLocaleDateString("es-ES", {
              month: "short",
              year: "numeric",
            })}
          </span>
          <button
            aria-label="Mes siguiente del directorio"
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </nav>
      </div>
      {withoutDate > 0 && (
        <div className="portal-directory-filter">
          <button aria-pressed={undated} onClick={() => setUndated((v) => !v)}>
            Sin fecha ({withoutDate})
          </button>
          {undated && (
            <button onClick={() => setUndated(false)}>Volver al mes</button>
          )}
        </div>
      )}
      {!rows.length && (
        <p>
          {undated
            ? "No hay contenido sin fecha."
            : "No hay publicaciones previstas para este mes."}
        </p>
      )}
      {rows.slice(0, limit).map((x) => (
        <div className="portal-row" key={x.id}>
          <span className={"portal-type-tag " + x.content_type}>
            {labels[x.content_type] || x.content_type}
          </span>
          <b>{x.title}</b>
          <span className="portal-directory-date">
            {x.calendar_at
              ? new Date(x.calendar_at).toLocaleDateString("es-ES")
              : "Sin fecha"}
          </span>
          <button
            className="portal-view-action"
            aria-label={"Ver contenido: " + x.title}
            onClick={() => open(x.id)}
          >
            <Eye className="portal-directory-icon" size={18} />
            <span>Ver contenido</span>
          </button>
          <button
            className={
              "portal-approve-action" +
              (x.status === "approved" ? " is-approved" : "")
            }
            aria-label={
              (x.status === "approved" ? "Aprobado: " : "Aprobar: ") + x.title
            }
            aria-pressed={x.status === "approved"}
            disabled={busy || x.status === "approved"}
            onClick={() => approve(x)}
          >
            <Check className="portal-directory-icon" size={18} />
            <span>{x.status === "approved" ? "Aprobado" : "Aprobar"}</span>
          </button>
        </div>
      ))}
      {rows.length > limit && (
        <button
          className="portal-directory-more"
          onClick={() => setLimit((n) => n + 12)}
        >
          Mostrar más ({rows.length - limit})
        </button>
      )}
    </div>
  );
}
