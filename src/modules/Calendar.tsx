import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { type Scope } from "../core/data";
import { dayKey, text, type Row } from "../core/model";
import { entity } from "../core/entities";
import { useRows } from "../core/useRows";
import { Editor } from "../core/Editor";
export function eventsForDay(rows: Row[], date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return rows
    .filter((r) => {
      const a = new Date(text(r.starts_at));
      const b = r.ends_at ? new Date(text(r.ends_at)) : a;
      return a < end && (b > start || dayKey(a) === dayKey(start));
    })
    .sort((a, b) => text(a.starts_at).localeCompare(text(b.starts_at)));
}
export function Calendar({ scope }: { scope: Scope }) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [edit, setEdit] = useState<Row | null | undefined>(),
    { rows, loading, error, reload } = useRows(entity("events"), scope);
  const offset = (month.getDay() + 6) % 7;
  const first = new Date(month);
  first.setDate(1 - offset);
  const days = Array.from(
    { length: 42 },
    (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  );
  return (
    <section>
      <header className="section-header">
        <div>
          <span className="eyebrow">SOCIAL / AGENDA</span>
          <h1>Calendario</h1>
          <p className="muted">Reuniones, sesiones e ideas con fecha.</p>
        </div>
        <button onClick={() => setEdit(null)}>
          <Plus size={16} />
          Nuevo evento
        </button>
      </header>
      <div className="calendar-toolbar">
        <h2>
          {new Intl.DateTimeFormat("es", {
            month: "long",
            year: "numeric",
          }).format(month)}
        </h2>
        <div>
          <button
            className="icon-button"
            aria-label="Mes anterior"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft />
          </button>
          <button
            className="ghost"
            onClick={() =>
              setMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Hoy
          </button>
          <button
            className="icon-button"
            aria-label="Mes siguiente"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando agenda…</p>
      ) : (
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div className="weekday" key={d}>
                {d}
              </div>
            ))}
            {days.map((d) => (
              <div
                className={`calendar-day ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dayKey(d) === dayKey(new Date()) ? "today" : ""}`}
                key={dayKey(d)}
              >
                <span className="day-number">{d.getDate()}</span>
                {eventsForDay(rows, d).map((r) => (
                  <button
                    className="calendar-event"
                    key={r.id}
                    onClick={() => setEdit(r)}
                  >
                    <time>
                      {new Intl.DateTimeFormat("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(text(r.starts_at)))}
                    </time>
                    <span>{text(r.title)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {edit !== undefined && (
        <Editor
          def={entity("events")}
          scope={scope}
          original={edit || undefined}
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
