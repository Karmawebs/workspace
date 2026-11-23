import { movePublicationDay } from "./socialScheduleTime";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { message, type Scope } from "../core/data";
import { dayKey, text, type Row } from "../core/model";
import { db } from "../lib/supabase";
import { SocialContentEditor } from "./SocialContentEditor";
import { SocialContentDot } from "./SocialContentDot";
import { cleanSocialMedia } from "./socialMedia";
import {
  itemsForDay,
  mainState,
  statusFilters,
  movableContent,
} from "./socialContent";

export function Calendar({ scope }: { scope: Scope }) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [edit, setEdit] = useState<Row | null | undefined>(),
    [rows, setRows] = useState<Row[]>([]),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]),
    [projectFilter, setProjectFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    void cleanSocialMedia(scope.workspaceId).catch(() => {
      /* Retry retained queue on next visit. */
    });
  }, [scope.workspaceId]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRevision((v) => v + 1);
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncInfo, setSyncInfo] = useState("");
  const [dragging, setDragging] = useState("");
  const [dropDay, setDropDay] = useState("");
  const moving = useRef(false);
  useEffect(() => {
    let active = true;
    setSyncInfo("");
    if (!projectFilter) return;
    void (async () => {
      const { data: accounts, error } = await db
        .from("kw_social_platform_connections")
        .select("id")
        .eq("project_id", projectFilter)
        .eq("platform", "instagram");
      if (error || !accounts?.length) return;
      const result = await db
        .from("kw_instagram_sync")
        .select("last_success_at,last_error,connection_id,imported_count")
        .in(
          "connection_id",
          accounts.map((a) => a.id),
        );
      if (!active) return;
      const dates = (result.data || [])
        .map((r) => r.last_success_at)
        .filter((d): d is string => !!d)
        .sort();
      setSyncInfo(
        (dates.length
          ? "Última sincronización: " + new Date(dates[0]).toLocaleString("es")
          : "Sincronización inicial pendiente") +
          ((result.data || []).some((r) => r.last_error)
            ? " · No se pudo actualizar. Revisa la conexión."
            : ""),
      );
    })();
    return () => {
      active = false;
    };
  }, [projectFilter, revision]);
  async function synchronize() {
    if (syncBusy || !projectFilter) return;
    setSyncBusy(true);
    setError("");
    try {
      const { data, error } = await db.functions.invoke(
        "social-instagram-sync",
        { body: { projectId: projectFilter } },
      );
      if (error) {
        const reason = await error.context?.json?.().catch(() => null);
        throw new Error(reason?.error || "No se pudo sincronizar Instagram.");
      }
      if (
        data?.results?.some(
          (r: { complete?: boolean; busy?: boolean }) => r.busy || !r.complete,
        )
      )
        setSyncInfo(
          "Sincronización en curso. El histórico continuará automáticamente.",
        );
      setRevision((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setSyncBusy(false);
    }
  }
  async function move(id: string, day: string) {
    setDragging("");
    setDropDay("");
    const row = rows.find((r) => r.id === id);
    if (!row || moving.current || !movableContent(row)) return;
    moving.current = true;
    setError("");
    try {
      const due = movePublicationDay(
        text(row.automatic_at || row.calendar_at || row.scheduled_at),
        day,
      );
      if (mainState(row) === "scheduled" && Date.parse(due) <= Date.now())
        throw new Error("Selecciona una fecha futura.");
      const { error } = await db.rpc("kw_move_social_content", {
        p_content: row.id,
        p_version: text(row.updated_at),
        p_due: due,
        p_attempt: text(row.attempt_id) || undefined,
        p_revision:
          typeof row.attempt_revision === "number"
            ? row.attempt_revision
            : undefined,
      });
      if (error) throw error;
      setRevision((v) => v + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      moving.current = false;
    }
  }

  useEffect(() => {
    if (
      !rows.some((row) =>
        ["scheduled", "publishing"].includes(text(row.publication_state)),
      )
    )
      return;
    const timer = window.setTimeout(() => setRevision((v) => v + 1), 15000);
    return () => clearTimeout(timer);
  }, [rows]);
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
          .from("kw_social_content_delivery")
          .select("*")
          .eq("workspace_id", scope.workspaceId)
          .gte("calendar_at", days[0].toISOString())
          .lt("calendar_at", end.toISOString())
          .order("calendar_at")
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
            <i className="social-dot carousel" />
            Carrusel
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
      {projectFilter && (
        <div className="social-sync-controls">
          <button
            className="ghost"
            onClick={() => void synchronize()}
            disabled={syncBusy}
          >
            {syncBusy ? "Sincronizando…" : "Sincronizar Instagram"}
          </button>
          <small className="muted" role="status">
            {syncInfo}
          </small>
        </div>
      )}
      <div
        className="social-status-filters"
        role="group"
        aria-label="Filtrar por estado"
      >
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className="ghost"
            aria-pressed={statusFilter === filter.value}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
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
                className={`calendar-day ${dropDay === dayKey(d) ? "social-drop-target" : ""} ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dayKey(d) === dayKey(new Date()) ? "today" : ""}`}
                key={dayKey(d)}
                onDragOver={(event) => {
                  if (dragging) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropDay(dayKey(d));
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void move(
                    event.dataTransfer.getData("text/plain"),
                    dayKey(d),
                  );
                }}
                onDragEnd={() => {
                  setDragging("");
                  setDropDay("");
                }}
              >
                <span className="day-number">{d.getDate()}</span>
                <div className="social-day-dots">
                  {itemsForDay(
                    rows.filter(
                      (row) => !statusFilter || mainState(row) === statusFilter,
                    ),
                    d,
                  ).map((r) => (
                    <SocialContentDot
                      key={r.id}
                      row={r}
                      onDrag={setDragging}
                      projectName={
                        projects.find((p) => p.id === r.project_id)?.name
                      }
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
