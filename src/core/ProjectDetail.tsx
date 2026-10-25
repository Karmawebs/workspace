import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Settings2, Pencil } from "lucide-react";
import { db } from "../lib/supabase";
import { type Scope, message } from "./data";
import { type Row, text, pretty, dateLabel } from "./model";
import { apps } from "../modules/config";
import { entity, type EntityKey } from "./entities";
import { Editor } from "./Editor";
import { EntityView } from "./EntityView";
import { WorkJournal } from "./WorkJournal";
import { useRows } from "./useRows";
import { Care } from "../modules/Care";
export function ProjectDetail({ scope }: { scope: Scope }) {
  const { id = "" } = useParams(),
    [project, setProject] = useState<Row>(),
    [error, setError] = useState(""),
    [tab, setTab] = useState("activity"),
    [edit, setEdit] = useState(false),
    [version, setVersion] = useState(0);
  const panels = useRows(entity("panels"), scope, id),
    events = useRows(entity("events"), scope, id),
    milestones = useRows(entity("milestones"), scope, id);
  useEffect(() => {
    let alive = true;
    setProject(undefined);
    setError("");
    db.from("kw_projects").select("*").eq("id", id).eq("workspace_id", scope.workspaceId).eq("app_key", scope.app).single().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError("Proyecto no disponible o sin acceso.");
      else setProject(data as Row);
    });
    return () => { alive = false; };
  }, [id, scope.workspaceId, scope.app, version]);
  if (error) return <div className="error" role="alert">{error}<Link to={`/${scope.app}/projects`}>Volver a proyectos</Link></div>;
  if (!project) return <p role="status">Cargando proyecto…</p>;
  const panelRows = panels.rows.length ? panels.rows.filter((p) => p.enabled).map((p) => ({ key: text(p.panel_key), title: text(p.title), subtitle: text(p.subtitle) })) : apps[scope.app].panels.map((p) => ({ ...p, subtitle: "" }));
  const tabs: { key: string; title: string; entity?: EntityKey }[] = [
    ...(scope.app === "work" ? [{ key: "activity", title: "Actividad" }, { key: "meetings", title: "Reuniones" }] : [{ key: "activity", title: "Actividad" }, { key: "journal", title: "Diario", entity: "journal" as const }]),
    { key: "resources", title: "Recursos", entity: "resources" },
    { key: "information", title: "Información" },
    { key: "members", title: "Equipo" },
    ...(scope.app === "work" ? [{ key: "milestones", title: "Hitos", entity: "milestones" as const }] : scope.app === "social" ? [{ key: "content", title: "Contenido", entity: "content" as const }] : [{ key: "sites", title: "Técnica", entity: "sites" as const }, { key: "connections", title: "Conexiones", entity: "connections" as const }]),
    { key: "panels", title: "Paneles", entity: "panels" },
  ];
  function panelTarget(key: string) {
    return key === "information" ? "information" : key === "connections" ? "connections" : key === "next_milestone" ? "milestones" : key === "next_event" ? scope.app === "work" ? "meetings" : "activity" : "resources";
  }
  function panelSubtitle(key: string) {
    if (key === "information") return text(project?.description) || "Datos del proyecto";
    if (key === "next_event") {
      const next = events.rows.find((r) => new Date(text(r.starts_at)) >= new Date());
      return next ? `${text(next.title)} · ${dateLabel(next.starts_at)}` : "Sin eventos próximos";
    }
    if (key === "next_milestone") {
      const next = milestones.rows.filter((r) => r.status !== "completed").sort((a, b) => text(a.due_at || "9999").localeCompare(text(b.due_at || "9999")))[0];
      return next ? text(next.title) : "Sin hitos pendientes";
    }
    return "Ver y gestionar";
  }
  return <>
    <Link className="back-link" to={`/${scope.app}/projects`}><ArrowLeft size={16}/>Proyectos</Link>
    <header className="page-heading"><div><span className="eyebrow">{apps[scope.app].name.toUpperCase()} / PROYECTO</span><h1>{text(project.name)}</h1><p className="muted">{pretty(project.status)}{project.archived ? " · Archivado" : ""}{project.due_date ? ` · Entrega ${dateLabel(project.due_date)}` : ""}</p></div><button className="secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Editar proyecto</button></header>
    {panels.error && <p className="error">{panels.error}</p>}
    <div className="quick-panels">{panelRows.map((p, i) => <button className="card quick-panel" key={i} onClick={() => setTab(panelTarget(p.key))}><div><span className="panel-icon">{["↗", "◈", "◷", "ⓘ"][i % 4]}</span><ArrowUpRight size={16}/></div><strong>{p.title}</strong><small>{p.subtitle || panelSubtitle(p.key)}</small></button>)}</div>
    <div className="tabs" role="tablist">{tabs.map((t) => <button role="tab" aria-selected={tab === t.key} className={tab === t.key ? "active" : ""} key={t.key} onClick={() => { setTab(t.key); if (t.key !== "panels") panels.reload(); }}>{t.key === "panels" && <Settings2 size={14}/>} {t.title}</button>)}</div>
    <div role="tabpanel">
      {tab === "activity" ? scope.app === "work" ? <div className="operations-grid"><EntityView kind="tasks" scope={scope} projectId={id} compact/><WorkJournal scope={scope} projectId={id}/></div> : <div className="operations-grid"><EntityView kind="tasks" scope={scope} projectId={id} compact/><EntityView kind="events" scope={scope} projectId={id} compact/></div>
      : tab === "meetings" && scope.app === "work" ? <EntityView kind="events" scope={scope} projectId={id} compact/>
      : tab === "information" ? <section className="card info-panel"><h2>Información del proyecto</h2><p className="preserve-lines">{text(project.description) || "Añade una descripción para dar contexto al equipo."}</p><dl><dt>Estado</dt><dd>{pretty(project.status)}</dd><dt>Prioridad</dt><dd>{pretty(project.priority)}</dd><dt>Inicio</dt><dd>{dateLabel(project.start_date) || "Sin fecha"}</dd><dt>Entrega</dt><dd>{dateLabel(project.due_date) || "Sin fecha"}</dd></dl><button className="secondary" onClick={() => setEdit(true)}>Editar información</button></section>
      : tab === "members" ? <ProjectMembers scope={scope} projectId={id}/>
      : tab === "sites" ? <Care scope={scope} projectId={id}/>
      : <EntityView key={tab} kind={tabs.find((t) => t.key === tab)?.entity || "resources"} scope={scope} projectId={id}/>}</div>
    {edit && <Editor def={entity("projects")} scope={scope} original={project} onClose={() => setEdit(false)} onSave={() => { setEdit(false); setVersion((v) => v + 1); }}/>} 
  </>;
}
function ProjectMembers({ scope, projectId }: { scope: Scope; projectId: string }) {
  const [rows, setRows] = useState<{ user_id: string; role: string }[]>([]), [members, setMembers] = useState<{ user_id: string }[]>([]), [error, setError] = useState(""), [version, setVersion] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all([db.from("kw_project_members").select("user_id,role").eq("project_id", projectId), db.from("kw_workspace_members").select("user_id").eq("workspace_id", scope.workspaceId)]).then(([a, b]) => {
      if (!alive) return;
      if (a.error || b.error) setError(message(a.error || b.error));
      else { setRows(a.data || []); setMembers(b.data || []); }
    });
    return () => { alive = false; };
  }, [projectId, scope.workspaceId, version]);
  return <section className="card info-panel"><h2>Equipo del proyecto</h2>{error && <p role="alert" className="error">{error}</p>}<form className="inline-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const user = String(new FormData(e.currentTarget).get("user")); const { error } = await db.from("kw_project_members").insert({ project_id: projectId, user_id: user, role: "member" }); setError(error?.message || ""); setVersion((v) => v + 1); setBusy(false); }}><select name="user" required aria-label="Miembro del Workspace"><option value="">Seleccionar miembro</option>{members.filter((m) => !rows.some((r) => r.user_id === m.user_id)).map((m) => <option key={m.user_id}>{m.user_id}</option>)}</select><button disabled={busy}>Añadir al proyecto</button></form>{rows.map((r) => <div className="record" key={r.user_id}><span>{r.user_id} · {pretty(r.role)}</span><button className="ghost danger" disabled={busy} onClick={async () => { setBusy(true); const { error } = await db.from("kw_project_members").delete().eq("project_id", projectId).eq("user_id", r.user_id); setError(error?.message || ""); setVersion((v) => v + 1); setBusy(false); }}>Quitar</button></div>)}</section>;
}
