import { Link } from "react-router-dom";
import { entity } from "../core/entities";
import { useRows } from "../core/useRows";
import type { Scope } from "../core/data";
import { EntityView } from "../core/EntityView";
export function Dashboard({ scope }: { scope: Scope }) {
  const projects = useRows(entity("projects"), scope),
    tasks = useRows(entity("tasks"), scope),
    milestones = useRows(entity("milestones"), scope);
  const stats = [
    {
      label: "Proyectos activos",
      value: projects.rows.filter((r) => !r.archived && r.status === "active")
        .length,
      path: "projects",
    },
    {
      label: "Tareas pendientes",
      value: tasks.rows.filter(
        (r) => !["done", "cancelled"].includes(String(r.status)),
      ).length,
      path: "tasks",
    },
    {
      label: "Hitos por completar",
      value: milestones.rows.filter((r) => r.status !== "completed").length,
      path: "milestones",
    },
  ];
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">WORK / VISTA GENERAL</span>
          <h1>Tu trabajo, en perspectiva</h1>
          <p className="muted">Lo importante para seguir avanzando.</p>
        </div>
      </header>
      {[projects.error, tasks.error, milestones.error]
        .filter(Boolean)
        .map((e, i) => (
          <p className="error" key={i}>
            {e}
          </p>
        ))}
      <div className="stats-grid dashboard-stats">
        {stats.map((s) => (
          <Link className="card" key={s.label} to={`/${scope.app}/${s.path}`}>
            <small>{s.label}</small>
            <strong>
              {projects.loading || tasks.loading || milestones.loading
                ? "—"
                : s.value}
            </strong>
            <span>Ver detalle ↗</span>
          </Link>
        ))}
      </div>
      <EntityView kind="projects" scope={scope} />
    </>
  );
}
