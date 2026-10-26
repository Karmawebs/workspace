import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Link2, Pencil, X } from "lucide-react";
import { db, config } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { Editor } from "../core/Editor";
import { entity } from "../core/entities";
import { message, type Scope } from "../core/data";
import { dateLabel, text, type Row } from "../core/model";
import { Care } from "./Care";

type PairingResult = { site_id: string; pairing_code: string; expires_at: string };

export function CareProjectRoute({ scope }: { scope: Scope }) {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Row>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    db.from("kw_projects").select("*").eq("id", id).eq("workspace_id", scope.workspaceId).eq("app_key", "care").single().then(({ data, error }) => {
      if (error) setError("Proyecto no disponible o sin acceso.");
      else setProject(data as Row);
    });
  }, [id, scope.workspaceId, version]);

  if (error) return <div className="error" role="alert">{error}<Link to="/care/projects">Volver a proyectos</Link></div>;
  if (!project) return <p role="status">Cargando proyecto…</p>;
  return <CareProject scope={scope} project={project} onProjectChange={() => setVersion((v) => v + 1)} />;
}

export function CareProject({ scope, project, onProjectChange }: { scope: Scope; project: Row; onProjectChange: () => void }) {
  const [site, setSite] = useState<Row>();
  const [installation, setInstallation] = useState<Row>();
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [edit, setEdit] = useState(false);
  const [connect, setConnect] = useState(false);
  const [pairing, setPairing] = useState<PairingResult>();
  const [pairingBusy, setPairingBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const { data: siteData, error: siteError } = await db.from("kw_care_sites").select("*").eq("project_id", project.id).maybeSingle();
    if (siteError) throw siteError;
    const s = siteData as Row | null;
    setSite(s || undefined);
    const legacySiteId = typeof s?.legacy_site_id === "string" ? s.legacy_site_id : "";
    if (!legacySiteId) { setInstallation(undefined); setAlerts([]); return; }
    const [i, a] = await Promise.all([
      db.from("installations").select("id,plugin_version,connected_at,last_seen_at,pairing_code,pairing_expires_at").eq("site_id", legacySiteId).maybeSingle(),
      db.from("alerts").select("id,title,severity,status").eq("site_id", legacySiteId).eq("status", "open"),
    ]);
    if (i.error || a.error) throw i.error || a.error;
    setInstallation((i.data as Row) || undefined);
    setAlerts((a.data as Row[]) || []);
  };

  useEffect(() => { load().catch((e) => setError(message(e))); }, [project.id]);

  const preparePairing = async () => {
    setPairingBusy(true); setError(""); setCopied(false);
    try {
      const { data: sessionData } = await db.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sesión no disponible.");
      const response = await fetch(`${config.url}/rest/v1/rpc/prepare_care_project_pairing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.key, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p_project_id: project.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "No se pudo generar el código.");
      const row = Array.isArray(body) ? body[0] : body;
      if (!row?.pairing_code) throw new Error("Care no devolvió un código de conexión.");
      setPairing(row as PairingResult);
      await load();
    } catch (e) { setError(message(e)); }
    finally { setPairingBusy(false); }
  };

  const openConnection = () => {
    setConnect(true); setCopied(false);
    const code = typeof installation?.pairing_code === "string" ? installation.pairing_code : "";
    const expires = typeof installation?.pairing_expires_at === "string" ? installation.pairing_expires_at : "";
    if (code && expires && new Date(expires).getTime() > Date.now()) setPairing({ site_id: text(site?.legacy_site_id), pairing_code: code, expires_at: expires });
    else { setPairing(undefined); void preparePairing(); }
  };

  const copyCode = async () => {
    if (!pairing?.pairing_code) return;
    await navigator.clipboard.writeText(pairing.pairing_code);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const metadata = (project.metadata && typeof project.metadata === "object" ? project.metadata : {}) as Record<string, unknown>;
  const connected = !!installation?.last_seen_at;
  const lastSeenAt = typeof installation?.last_seen_at === "string" ? installation.last_seen_at : "";

  return <>
    <Link className="back-link" to="/care/projects"><ArrowLeft size={16}/>Proyectos</Link>
    <header className="page-heading care-project-heading">
      <div><span className="eyebrow">CARE / PROYECTO</span><h1>{text(project.name)}</h1><p className="muted">{text(site?.domain) || "Sin dominio"} · {text(metadata.care_plan_name) || "Mantenimiento"}</p></div>
      <div className="care-heading-actions"><button className="secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Editar</button><button onClick={openConnection}><Link2 size={16}/>{connected ? "Reconectar" : "Conectar"}</button></div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="quick-panels care-summary">
      <div className="card quick-panel"><small>Mantenimiento</small><strong>{text(metadata.care_plan_name) || "Sin plan"}</strong><span>{metadata.care_plan_price !== undefined ? `${Number(metadata.care_plan_price)} €/mes` : "Configurable"}</span></div>
      <div className="card quick-panel"><small>Estado web</small><strong>{site ? "Activo" : "Pendiente"}</strong><span>{text(site?.domain) || "Se detectará al conectar"}</span></div>
      <div className="card quick-panel"><small>Alertas</small><strong>{alerts.length}</strong><span>{alerts.length ? "Requieren revisión" : "Todo correcto"}</span></div>
      <div className="card quick-panel"><small>Conexión</small><strong>{connected ? "Conectado" : "Sin conectar"}</strong><span>{connected && lastSeenAt ? `Último contacto ${dateLabel(lastSeenAt)}` : "Conecta el plugin de WordPress"}</span></div>
    </div>
    <div className="operations-grid care-project-columns"><EntityView kind="tasks" scope={scope} projectId={text(project.id)} compact/><EntityView kind="journal" scope={scope} projectId={text(project.id)} compact/></div>
    <section className="care-technical-full"><Care scope={scope} projectId={text(project.id)}/></section>
    {connect && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setConnect(false)}><section className="care-project-modal care-connect-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header"><div><span className="eyebrow">CARE / CONEXIÓN</span><h2>Conectar WordPress</h2></div><button className="care-project-modal-close" onClick={() => setConnect(false)} aria-label="Cerrar"><X size={20}/></button></header>
      {pairingBusy ? <div className="care-pairing-loading">Generando código de conexión…</div> : pairing ? <div className="care-pairing-content">
        <p>Instala Karma Care en WordPress y pega este código en <strong>Karma Care → Código de conexión</strong>.</p>
        <button className="care-pairing-code" onClick={copyCode}><span>{pairing.pairing_code}</span>{copied ? <Check size={19}/> : <Copy size={19}/>}</button>
        <small>Válido durante 24 horas y de un solo uso.</small>
        <div className="care-pairing-steps"><span>1</span><p>Abre <strong>Karma Care</strong> en WordPress.</p><span>2</span><p>Pega el código y pulsa <strong>Conectar</strong>.</p><span>3</span><p>Vuelve aquí: la conexión y el diagnóstico aparecerán automáticamente.</p></div>
        <button className="secondary care-regenerate" onClick={preparePairing}>Generar otro código</button>
      </div> : <div><p>No se pudo generar el código.</p><button onClick={preparePairing}>Reintentar</button></div>}
    </section></div>}
    {edit && <Editor def={entity("projects")} scope={scope} original={project} onClose={() => setEdit(false)} onSave={() => { setEdit(false); onProjectChange(); }}/>} 
  </>;
}
