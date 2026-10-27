import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { entity } from "../core/entities";
import { useRows } from "../core/useRows";
import { Editor } from "../core/Editor";
import { message, removeRow, saveRow, type Scope } from "../core/data";
import { text, type Row } from "../core/model";
import { db } from "../lib/supabase";
import "./care-projects.css";

type Health = { connected: boolean; total: number; pending: number; loaded: boolean };

function ProjectHealth({ projectId }: { projectId: string }) {
  const [state, setState] = useState<Health>({ connected: false, total: 0, pending: 0, loaded: false });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const careSite = await db.from("kw_care_sites").select("legacy_site_id").eq("project_id", projectId).maybeSingle();
      if (careSite.error) throw careSite.error;
      const siteId = text(careSite.data?.legacy_site_id);
      if (!siteId) {
        if (alive) setState({ connected: false, total: 0, pending: 0, loaded: true });
        return;
      }
      const installation = await db.from("installations").select("connected_at").eq("site_id", siteId).limit(1).maybeSingle();
      if (installation.error) throw installation.error;
      const connected = !!installation.data?.connected_at;
      const diagnostic = await db.from("diagnostics").select("id,wp_update_available").eq("site_id", siteId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (diagnostic.error) throw diagnostic.error;
      if (!diagnostic.data) {
        if (alive) setState({ connected, total: 0, pending: 0, loaded: true });
        return;
      }
      const [plugins, themes] = await Promise.all([
        db.from("plugin_snapshots").select("id,update_available").eq("diagnostic_id", diagnostic.data.id),
        db.from("theme_snapshots").select("id,update_available").eq("diagnostic_id", diagnostic.data.id),
      ]);
      if (plugins.error || themes.error) throw plugins.error || themes.error;
      const pluginRows = plugins.data || [];
      const themeRows = themes.data || [];
      const total = pluginRows.length + themeRows.length + 1;
      const pending = pluginRows.filter((r) => r.update_available).length + themeRows.filter((r) => r.update_available).length + (diagnostic.data.wp_update_available ? 1 : 0);
      if (alive) setState({ connected, total, pending, loaded: true });
    };
    void load().catch(() => alive && setState({ connected: false, total: 0, pending: 0, loaded: true }));
    return () => { alive = false; };
  }, [projectId]);

  if (!state.loaded) return <><span className="badge">Consultando</span><div className="care-project-health care-project-health--neutral"><div className="care-project-health__track"><span /></div><small>Consultando estado…</small></div></>;
  if (!state.connected) return <><span className="badge">Sin conectar</span><div className="care-project-health care-project-health--neutral"><div className="care-project-health__top"><span>Mantenimiento</span><strong>—</strong></div><div className="care-project-health__track"><span /></div><small>Sin datos técnicos</small></div></>;
  if (!state.total) return <><span className="badge connected">Conectado</span><div className="care-project-health care-project-health--neutral"><div className="care-project-health__top"><span>Mantenimiento</span><strong>—</strong></div><div className="care-project-health__track"><span /></div><small>Sin diagnóstico</small></div></>;

  const ratio = state.pending / state.total;
  const percent = Math.max(0, Math.round((1 - ratio) * 100));
  const tone = state.pending === 0 ? "good" : ratio > .5 ? "danger" : "warning";
  return <>
    <span className="badge connected">Conectado</span>
    <div className={`care-project-health care-project-health--${tone}`} aria-label={`Mantenimiento ${percent}%, ${state.pending} pendientes`}>
      <div className="care-project-health__top"><span>Mantenimiento</span><strong>{percent}%</strong></div>
      <div className="care-project-health__track"><span style={{ width: `${percent}%` }} /></div>
      <small>{state.pending === 0 ? "Todo actualizado" : `${state.pending} ${state.pending === 1 ? "pendiente" : "pendientes"}`}</small>
    </div>
  </>;
}

export function CareProjects({ scope }: { scope: Scope }) {
  const def = entity("projects");
  const { rows, loading, error, reload } = useRows(def, scope);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<Row | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const visible = rows.filter((row) => !!row.archived === archived && [row.name, row.description].some((value) => text(value).toLowerCase().includes(query.toLowerCase())));

  async function archive(row: Row) {
    setBusy(true); setFailure("");
    try { await saveRow(def, scope, { archived: !row.archived }, row); reload(); }
    catch (e) { setFailure(message(e)); }
    finally { setBusy(false); }
  }
  async function remove(row: Row) {
    if (!window.confirm(`¿Eliminar “${text(row.name)}”? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setFailure("");
    try { await removeRow(def, scope, row); reload(); }
    catch (e) { setFailure(message(e)); }
    finally { setBusy(false); }
  }

  return <section className="entity-page care-project-archive">
    <header className="section-header">
      <div><span className="eyebrow">TU ESPACIO DE CARE</span><h2>Proyectos <span className="count">{visible.length}</span></h2><p className="muted">Una vista clara del mantenimiento de todas tus webs.</p></div>
      <button onClick={() => setEdit(null)}><Plus size={16}/>Nuevo proyecto</button>
    </header>
    <div className="filters">
      <label className="search"><Search size={16}/><input aria-label="Buscar proyectos" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)}/>Archivados</label>
    </div>
    {(error || failure) && <div className="error">{error || failure}</div>}
    {loading ? <p className="empty">Cargando…</p> : visible.length === 0 ? <div className="empty"><div className="empty-symbol">◇</div><h3>Todo empieza aquí</h3><p>Crea un proyecto para empezar.</p></div> : <div className="care-project-list">
      {visible.map((row) => <article className="card care-project-row" key={text(row.id)}>
        <div className="care-project-row__name"><Link to={`/care/projects/${text(row.id)}`}>{text(row.name) || "Sin título"}</Link></div>
        <ProjectHealth projectId={text(row.id)} />
        <div className="care-project-row__actions">
          <button className="icon-button" aria-label="Editar proyecto" onClick={() => setEdit(row)}><Pencil size={16}/></button>
          <button className="icon-button" aria-label={row.archived ? "Desarchivar proyecto" : "Archivar proyecto"} disabled={busy} onClick={() => void archive(row)}><Archive size={16}/></button>
          <button className="icon-button danger" aria-label="Eliminar proyecto" disabled={busy} onClick={() => void remove(row)}><Trash2 size={16}/></button>
        </div>
      </article>)}
    </div>}
    {edit !== undefined && <Editor def={def} scope={scope} original={edit || undefined} onClose={() => setEdit(undefined)} onSave={() => { setEdit(undefined); reload(); }} />}
  </section>;
}
