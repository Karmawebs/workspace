import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Link2, Pencil } from "lucide-react";
import { db } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { Editor } from "../core/Editor";
import { entity } from "../core/entities";
import { message, type Scope } from "../core/data";
import { dateLabel, text, type Row } from "../core/model";
import { Care } from "./Care";

export function CareProjectRoute({ scope }: { scope: Scope }) {
  const { id = "" } = useParams(); const [project, setProject] = useState<Row>(), [error, setError] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => { db.from("kw_projects").select("*").eq("id", id).eq("workspace_id", scope.workspaceId).eq("app_key", "care").single().then(({ data, error }) => { if (error) setError("Proyecto no disponible o sin acceso."); else setProject(data as Row); }); }, [id, scope.workspaceId, version]);
  if (error) return <div className="error" role="alert">{error}<Link to="/care/projects">Volver a proyectos</Link></div>;
  if (!project) return <p role="status">Cargando proyecto…</p>;
  return <CareProject scope={scope} project={project} onProjectChange={() => setVersion((v) => v + 1)} />;
}

export function CareProject({ scope, project, onProjectChange }: { scope: Scope; project: Row; onProjectChange: () => void }) {
  const [site, setSite] = useState<Row>(), [installation, setInstallation] = useState<Row>(), [alerts, setAlerts] = useState<Row[]>([]), [edit, setEdit] = useState(false), [connect, setConnect] = useState(false), [error, setError] = useState("");
  const load = async () => {
    const { data: siteData, error: siteError } = await db.from("kw_care_sites").select("*").eq("project_id", project.id).maybeSingle();
    if (siteError) throw siteError; const s = siteData as Row | null; setSite(s || undefined);
    if (!s?.legacy_site_id) { setInstallation(undefined); setAlerts([]); return; }
    const [i, a] = await Promise.all([db.from("installations").select("id,plugin_version,connected_at,last_seen_at").eq("site_id", s.legacy_site_id).maybeSingle(), db.from("alerts").select("id,title,severity,status").eq("site_id", s.legacy_site_id).eq("status", "open")]);
    if (i.error || a.error) throw i.error || a.error; setInstallation((i.data as Row) || undefined); setAlerts((a.data as Row[]) || []);
  };
  useEffect(() => { load().catch((e) => setError(message(e))); }, [project.id]);
  const metadata = (project.metadata && typeof project.metadata === "object" ? project.metadata : {}) as Record<string, unknown>;
  const connected = !!installation?.last_seen_at;
  return <>
    <Link className="back-link" to="/care/projects"><ArrowLeft size={16}/>Proyectos</Link>
    <header className="page-heading care-project-heading"><div><span className="eyebrow">CARE / PROYECTO</span><h1>{text(project.name)}</h1><p className="muted">{text(site?.domain) || "Sin dominio"} · {text(metadata.care_plan_name) || "Mantenimiento"}</p></div><div className="care-heading-actions"><button className="secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Editar</button><button onClick={() => setConnect(true)}><Link2 size={16}/>{connected ? "Reconectar" : "Conectar"}</button></div></header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="quick-panels care-summary"><div className="card quick-panel"><small>Mantenimiento</small><strong>{text(metadata.care_plan_name) || "Sin plan"}</strong><span>{metadata.care_plan_price !== undefined ? `${Number(metadata.care_plan_price)} €/mes` : "Configurable"}</span></div><div className="card quick-panel"><small>Estado web</small><strong>{site ? "Activo" : "Pendiente"}</strong><span>{text(site?.domain) || "Añade el dominio"}</span></div><div className="card quick-panel"><small>Alertas</small><strong>{alerts.length}</strong><span>{alerts.length ? "Requieren revisión" : "Todo correcto"}</span></div><div className="card quick-panel"><small>Conexión</small><strong>{connected ? "Conectado" : "Sin conectar"}</strong><span>{connected ? `Último contacto ${dateLabel(installation?.last_seen_at)}` : "Conecta el plugin de WordPress"}</span></div></div>
    <div className="operations-grid care-project-columns"><EntityView kind="tasks" scope={scope} projectId={text(project.id)} compact/><EntityView kind="journal" scope={scope} projectId={text(project.id)} compact/></div>
    <section className="care-technical-full"><Care scope={scope} projectId={text(project.id)}/></section>
    {connect && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConnect(false)}><section className="modal card" role="dialog" aria-modal="true"><header className="section-header"><div><span className="eyebrow">CARE / CONEXIÓN</span><h2>Conectar WordPress</h2></div><button className="ghost" onClick={() => setConnect(false)}>Cerrar</button></header><p>Vincula este proyecto con la instalación de Karma Care del sitio.</p><EntityView kind="sites" scope={scope} projectId={text(project.id)} compact/></section></div>}
    {edit && <Editor def={entity("projects")} scope={scope} original={project} onClose={() => setEdit(false)} onSave={() => { setEdit(false); onProjectChange(); }}/>} 
  </>;
}
