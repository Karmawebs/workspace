import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bell, Check, Copy, FileText, KeyRound, Link2, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { db, config } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { Editor } from "../core/Editor";
import { entity } from "../core/entities";
import { message, type Scope } from "../core/data";
import { text, type Row } from "../core/model";
import { Care } from "./Care";

type PairingResult = { site_id: string; pairing_code: string; expires_at: string };
type ProjectFile = { id: string; storage_path: string; original_filename: string; mime_type: string; size: number; created_at: string };
type FilePreview = { file: ProjectFile; url: string };
const filesDb = db as any;

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
  const fileInput = useRef<HTMLInputElement>(null);
  const [site, setSite] = useState<Row>();
  const [installation, setInstallation] = useState<Row>();
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [accessCount, setAccessCount] = useState(0);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [fileUrls, setFileUrls] = useState<Record<string,string>>({});
  const [filePreview, setFilePreview] = useState<FilePreview>();
  const [edit, setEdit] = useState(false);
  const [connect, setConnect] = useState(false);
  const [accessesOpen, setAccessesOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [pairing, setPairing] = useState<PairingResult>();
  const [pairingBusy, setPairingBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadFiles = async () => {
    const { data, error } = await filesDb.from("kw_project_files").select("id,storage_path,original_filename,mime_type,size,created_at").eq("workspace_id", scope.workspaceId).eq("project_id", project.id).order("created_at", { ascending: false });
    if (error) throw error;
    setFiles((data || []) as ProjectFile[]);
  };

  const load = async () => {
    const [siteResponse, accessResponse, fileResponse] = await Promise.all([
      db.from("kw_care_sites").select("*").eq("project_id", project.id).maybeSingle(),
      db.from("kw_project_resources").select("id", { count: "exact", head: true }).eq("workspace_id", scope.workspaceId).eq("project_id", project.id).eq("app_key", "care").eq("type", "access"),
      filesDb.from("kw_project_files").select("id,storage_path,original_filename,mime_type,size,created_at").eq("workspace_id", scope.workspaceId).eq("project_id", project.id).order("created_at", { ascending: false }),
    ]);
    if (siteResponse.error || accessResponse.error || fileResponse.error) throw siteResponse.error || accessResponse.error || fileResponse.error;
    setAccessCount(accessResponse.count || 0);
    setFiles((fileResponse.data || []) as ProjectFile[]);
    const s = siteResponse.data as Row | null;
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

  useEffect(() => {
    if (!filesOpen || !files.length) return;
    let active = true;
    Promise.all(files.map(async (file) => {
      const { data, error } = await db.storage.from("care-project-files").createSignedUrl(file.storage_path, 1800);
      return error || !data?.signedUrl ? null : [file.id, data.signedUrl] as const;
    })).then((entries) => {
      if (!active) return;
      setFileUrls(Object.fromEntries(entries.filter(Boolean) as readonly (readonly [string,string])[]));
    }).catch((e) => active && setError(message(e)));
    return () => { active = false; };
  }, [filesOpen, files]);

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

  const uploadFiles = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setFileBusy(true); setError("");
    try {
      for (const file of Array.from(selected)) {
        if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name} supera el límite de 50 MB.`);
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${scope.workspaceId}/${project.id}/${crypto.randomUUID()}-${safe}`;
        const { error: uploadError } = await db.storage.from("care-project-files").upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) throw uploadError;
        const { error: rowError } = await filesDb.from("kw_project_files").insert({ workspace_id: scope.workspaceId, project_id: project.id, app_key: "care", storage_path: path, original_filename: file.name, mime_type: file.type || "application/octet-stream", size: file.size });
        if (rowError) {
          await db.storage.from("care-project-files").remove([path]);
          throw rowError;
        }
      }
      await loadFiles();
    } catch (e) { setError(message(e)); }
    finally { setFileBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  const openFile = async (file: ProjectFile) => {
    setError("");
    const existing = fileUrls[file.id];
    if (existing) { setFilePreview({ file, url: existing }); return; }
    const { data, error } = await db.storage.from("care-project-files").createSignedUrl(file.storage_path, 1800);
    if (error) { setError(message(error)); return; }
    setFileUrls((current) => ({ ...current, [file.id]: data.signedUrl }));
    setFilePreview({ file, url: data.signedUrl });
  };

  const deleteFile = async (file: ProjectFile) => {
    setFileBusy(true); setError("");
    try {
      const { error: storageError } = await db.storage.from("care-project-files").remove([file.storage_path]);
      if (storageError) throw storageError;
      const { error: rowError } = await filesDb.from("kw_project_files").delete().eq("id", file.id).eq("workspace_id", scope.workspaceId).eq("project_id", project.id);
      if (rowError) throw rowError;
      if (filePreview?.file.id === file.id) setFilePreview(undefined);
      await loadFiles();
    } catch (e) { setError(message(e)); }
    finally { setFileBusy(false); }
  };

  const metadata = (project.metadata && typeof project.metadata === "object" ? project.metadata : {}) as Record<string, unknown>;
  const connected = !!installation?.last_seen_at;

  return <>
    <Link className="back-link" to="/care/projects"><ArrowLeft size={16}/>Proyectos</Link>
    <header className="page-heading care-project-heading">
      <div><span className="eyebrow">CARE / PROYECTO</span><h1>{text(project.name)}</h1><p className="muted">{text(site?.domain) || "Sin dominio"} · {text(metadata.care_plan_name) || "Mantenimiento"}</p></div>
      <div className="care-heading-actions"><button className="secondary" onClick={() => setEdit(true)}><Pencil size={16}/>Editar</button><button onClick={openConnection}><Link2 size={16}/>{connected ? "Reconectar" : "Conectar"}</button></div>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="care-summary-redesign">
      <div className="card quick-panel care-summary-main"><small>Mantenimiento</small><strong>{text(metadata.care_plan_name) || "Sin plan"}</strong><span>{metadata.care_plan_price !== undefined ? `${Number(metadata.care_plan_price)} €/mes` : "Configurable"}</span></div>
      <div className="card quick-panel care-summary-main"><small>Estado web</small><strong>{site ? "Activo" : "Pendiente"}</strong><span>{text(site?.domain) || "Se detectará al conectar"}</span></div>
      <button className="card care-summary-tool" type="button"><Bell size={20}/><span>Alertas</span><strong>{alerts.length}</strong><small>{alerts.length ? "Revisar" : "Todo correcto"}</small></button>
      <button className="card care-summary-tool" type="button" onClick={() => setAccessesOpen(true)}><KeyRound size={20}/><span>Accesos</span><strong>{accessCount}</strong><small>Usuarios y claves</small></button>
      <button className="card care-summary-tool" type="button" onClick={() => setFilesOpen(true)}><FileText size={20}/><span>Archivos</span><strong>{files.length}</strong><small>Documentos adjuntos</small></button>
    </div>
    <div className="operations-grid care-project-columns"><EntityView kind="tasks" scope={scope} projectId={text(project.id)} compact/><EntityView kind="journal" scope={scope} projectId={text(project.id)} compact/></div>
    <section className="care-technical-full"><Care scope={scope} projectId={text(project.id)}/></section>

    {accessesOpen && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAccessesOpen(false)}><section className="care-project-modal care-project-resource-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header"><div><span className="eyebrow">CARE / ACCESOS</span><h2>Accesos del proyecto</h2></div><button className="care-project-modal-close" onClick={() => { setAccessesOpen(false); void load(); }} aria-label="Cerrar"><X size={20}/></button></header>
      <EntityView kind="resources" scope={scope} projectId={text(project.id)} compact/>
    </section></div>}

    {filesOpen && <div className="care-project-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !filePreview && setFilesOpen(false)}><section className="care-project-modal care-project-resource-modal care-files-modal" role="dialog" aria-modal="true">
      <header className="care-project-modal-header care-files-header"><div><span className="eyebrow">CARE / ARCHIVOS</span><h2>Archivos del proyecto</h2></div><div className="care-files-header-actions"><input ref={fileInput} type="file" multiple hidden onChange={(e) => void uploadFiles(e.target.files)}/><button type="button" className="care-file-header-button" onClick={() => fileInput.current?.click()} disabled={fileBusy} aria-label="Adjuntar archivos" title="Adjuntar archivos"><Paperclip size={20}/></button><button type="button" className="care-project-modal-close" onClick={() => { setFilePreview(undefined); setFilesOpen(false); }} aria-label="Cerrar"><X size={20}/></button></div></header>
      {files.length ? <div className="care-file-wall">{files.map((file) => {
        const isImage=file.mime_type.startsWith("image/");
        const signed=fileUrls[file.id];
        return <article className="care-file-tile" key={file.id}>
          <button type="button" className="care-file-thumb" onClick={() => void openFile(file)} aria-label={`Abrir ${file.original_filename}`}>
            {isImage&&signed?<img src={signed} alt={file.original_filename}/>:<span className="care-file-fallback"><FileText size={28}/><small>{file.original_filename}</small></span>}
          </button>
          <button type="button" className="care-file-delete" aria-label="Eliminar archivo" title="Eliminar archivo" disabled={fileBusy} onClick={() => void deleteFile(file)}><Trash2 size={15}/></button>
        </article>;
      })}</div>:<p className="muted care-files-empty">Todavía no hay archivos adjuntos.</p>}
      {filePreview&&<div className="care-file-viewer" onMouseDown={(e)=>e.target===e.currentTarget&&setFilePreview(undefined)}><div className="care-file-viewer-panel"><header><strong>{filePreview.file.original_filename}</strong><button type="button" className="care-file-viewer-close" onClick={()=>setFilePreview(undefined)} aria-label="Cerrar vista previa"><X size={20}/></button></header><div className="care-file-viewer-content">{filePreview.file.mime_type.startsWith("image/")?<img src={filePreview.url} alt={filePreview.file.original_filename}/>:filePreview.file.mime_type==="application/pdf"?<iframe src={filePreview.url} title={filePreview.file.original_filename}/>:<div className="care-file-viewer-fallback"><FileText size={42}/><strong>{filePreview.file.original_filename}</strong><span>Vista previa no disponible para este formato.</span></div>}</div></div></div>}
    </section></div>}

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
