import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { message, type Scope } from "../core/data";
import { dayKey, text, type Row } from "../core/model";
import { db } from "../lib/supabase";
import { SocialContentEditor } from "./SocialContentEditor";
import { SocialContentDot } from "./SocialContentDot";
import { cleanSocialMedia } from "./socialMedia";
import { itemsForDay } from "./socialContent";

export function Calendar({ scope }: { scope: Scope }) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [edit, setEdit] = useState<Row | null | undefined>(),
    [rows, setRows] = useState<Row[]>([]),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectFilter, setProjectFilter] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    void cleanSocialMedia(scope.workspaceId).catch(() => {
      /* Retry retained queue on next visit. */
    });
  }, [scope.workspaceId]);
  const [revision, setRevision] = useState(0);
  const days = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    return Array.from(
      { length: 42 },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i),
    );
  }, [month]);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail?.table === "kw_content_items" &&
        detail.workspaceId === scope.workspaceId
      )
        setRevision((v) => v + 1);
    };
    window.addEventListener("kw-records-changed", changed);
    return () => window.removeEventListener("kw-records-changed", changed);
  }, [scope.workspaceId]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setRows([]);
    const end = new Date(days[41]);
    end.setDate(end.getDate() + 1);
    async function load() {
      const all: Row[] = [];
      // Supabase caps each response. Page within the visible local-date interval.
      for (let start = 0; ; start += 1000) {
        let query = db
          .from("kw_content_items")
          .select("*")
          .eq("workspace_id", scope.workspaceId)
          .gte("scheduled_at", days[0].toISOString())
          .lt("scheduled_at", end.toISOString())
          .order("scheduled_at")
          .order("sort_order")
          .order("id")
          .range(start, start + 999);
        if (projectFilter) query = query.eq("project_id", projectFilter);
        const { data, error } = await query;
        if (!alive) return;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      if (alive) setRows(all);
    }
    void load()
      .catch((e) => {
        if (alive) setError(message(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [scope.workspaceId, days, projectFilter, revision]);
  useEffect(() => {
    let alive = true;
    db.from("kw_projects")
      .select("id,name")
      .eq("workspace_id", scope.workspaceId)
      .eq("app_key", "social")
      .order("name")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else setProjects(data || []);
      });
    return () => {
      alive = false;
    };
  }, [scope.workspaceId]);
  return (
    <section className="social-calendar-page">
      <header className="section-header">
        <div>
          <span className="eyebrow">SOCIAL / PLANIFICADOR</span>
          <h1>Calendario</h1>
          <p className="muted">
            Planificación visual del contenido por cliente.
          </p>
        </div>
        <button onClick={() => setEdit(null)}>
          <Plus size={16} />
          Nuevo contenido
        </button>
      </header>
      <div className="social-calendar-controls">
        <label>
          Cliente / proyecto
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="social-format-legend">
          <span>
            <i className="social-dot post" />
            Post
          </span>
          <span>
            <i className="social-dot reel" />
            Reel
          </span>
          <span>
            <i className="social-dot story" />
            Story
          </span>
        </div>
      </div>
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
        <p role="status">Cargando calendario…</p>
      ) : (
        <div className="calendar-scroll">
          <div className="calendar-grid social-calendar-grid">
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
                <div className="social-day-dots">
                  {itemsForDay(rows, d).map((r) => (
                    <SocialContentDot
                      key={r.id}
                      row={r}
                      onEdit={() => setEdit(r)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {edit !== undefined && (
        <SocialContentEditor
          scope={scope}
          original={edit || undefined}
          projectId={!edit ? projectFilter || undefined : undefined}
          onClose={() => setEdit(undefined)}
          onSave={() => setEdit(undefined)}
        />
      )}
    </section>
  );
}
