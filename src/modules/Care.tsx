import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { message, type Scope } from "../core/data";
import { dateLabel, text, type Row } from "../core/model";

export function Care({ scope, projectId }: { scope: Scope; projectId?: string }) {
  const [site, setSite] = useState<Row>();
  return <>
    <EntityView kind="sites" scope={scope} projectId={projectId} extra={(row) => (
      <button className="secondary technical-button" disabled={!row.legacy_site_id} onClick={() => setSite(row)}>
        {row.legacy_site_id ? "Ver diagnóstico y conexión" : "Sin vínculo técnico"}
      </button>
    )}/>
    {site && <Technical site={site} close={() => setSite(undefined)}/>} 
  </>;
}

function Technical({ site, close }: { site: Row; close: () => void }) {
  const [data, setData] = useState<Record<string, Row[]>>();
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const id = text(site.legacy_site_id);
      const responses = await Promise.all([
        db.from("diagnostics").select("id,captured_at,wp_version,php_version,https,server_software,locale,timezone,multisite,wp_memory_limit,php_memory_limit,upload_max_filesize,post_max_size,database_version,site_kit_status,health,raw,wp_update_available").eq("site_id", id).order("captured_at", { ascending: false }).limit(20),
        db.from("installations").select("id,plugin_version,connected_at,last_seen_at").eq("site_id", id).limit(1),
        db.from("alerts").select("id,title,severity,message,status").eq("site_id", id).eq("status", "open").limit(50),
      ]);
      for (const r of responses) if (r.error) throw r.error;
      const result: Record<string, Row[]> = {
        diagnostics: (responses[0].data as Row[]) || [],
        installation: (responses[1].data as Row[]) || [],
        alerts: (responses[2].data as Row[]) || [],
      };
      const diagnostic = result.diagnostics[0];
      if (diagnostic) {
        const [plugins, themes] = await Promise.all([
          db.from("plugin_snapshots").select("id,name,version,active,update_available,available_version").eq("diagnostic_id", diagnostic.id),
          db.from("theme_snapshots").select("id,name,version,active,update_available,available_version").eq("diagnostic_id", diagnostic.id),
        ]);
        if (plugins.error || themes.error) throw plugins.error || themes.error;
        result.plugins = (plugins.data as Row[]) || [];
        result.themes = (themes.data as Row[]) || [];
      }
      if (alive) setData(result);
    })().catch((e) => alive && setError(message(e)));
    return () => { alive = false; };
  }, [site.id]);

  const diagnostic = data?.diagnostics?.[0];
  const installation = data?.installation?.[0];
  const raw = diagnostic?.raw && typeof diagnostic.raw === "object" ? diagnostic.raw as Record<string, unknown> : {};
  const siteKit = raw.site_kit && typeof raw.site_kit === "object" ? raw.site_kit as Record<string, unknown> : {};
  const services = Array.isArray(siteKit.services) ? siteKit.services.map(String) : [];
  const health = Array.isArray(diagnostic?.health) ? diagnostic.health as Row[] : [];
  const warningCount = health.filter((item) => item.status === "warning").length;
  const problemCount = health.filter((item) => item.status === "problem").length;

  return <section className="card technical-panel">
    <header className="section-header">
      <div><span className="eyebrow">CARE / DIAGNÓSTICO</span><h2>{text(site.domain)}</h2></div>
      <button className="ghost" onClick={close}>Cerrar diagnóstico</button>
    </header>
    {error ? <p className="error" role="alert">{error}</p> : !data ? <p role="status">Consultando diagnóstico…</p> : <>
      <div className="stats-grid">
        <div><small>WordPress</small><strong>{text(diagnostic?.wp_version) || "Sin datos"}</strong></div>
        <div><small>PHP</small><strong>{text(diagnostic?.php_version) || "Sin datos"}</strong></div>
        <div><small>Plugin Care</small><strong>{text(installation?.plugin_version) || "Sin conexión"}</strong></div>
        <div><small>Último contacto</small><strong className="small-stat">{dateLabel(installation?.last_seen_at) || "Sin datos"}</strong></div>
      </div>
      <p className="muted">Diagnóstico: {dateLabel(diagnostic?.captured_at) || "Todavía no disponible"}</p>

      <div className="operations-grid">
        <div>
          <h3>Servidor</h3>
          <div className="record"><span>Servidor web</span><strong>{text(diagnostic?.server_software) || "Sin datos"}</strong></div>
          <div className="record"><span>Memoria WordPress</span><strong>{text(diagnostic?.wp_memory_limit) || "Sin datos"}</strong></div>
          <div className="record"><span>Memoria PHP</span><strong>{text(diagnostic?.php_memory_limit) || "Sin datos"}</strong></div>
          <div className="record"><span>Subida máxima</span><strong>{text(diagnostic?.upload_max_filesize) || "Sin datos"}</strong></div>
          <div className="record"><span>Base de datos</span><strong>{text(diagnostic?.database_version) || "Sin datos"}</strong></div>
        </div>
        <div>
          <h3>Google Site Kit</h3>
          <div className="record"><span>Estado</span><span className="badge">{text(diagnostic?.site_kit_status) || "Sin datos"}</span></div>
          {services.length ? services.map((service) => <div className="record" key={service}><span>{service}</span><span className="badge">Conectado</span></div>) : <p className="muted">No hay servicios detectados.</p>}
        </div>
      </div>

      <div className="operations-grid">
        {["plugins", "themes"].map((key) => <div key={key}>
          <h3>{key === "plugins" ? "Plugins" : "Temas"}</h3>
          {!data[key]?.length && <p className="muted">Sin registros.</p>}
          {data[key]?.map((r) => <div className="record" key={r.id}>
            <span>{text(r.name)} <small>{text(r.version)}</small></span>
            <span className="badge">{r.update_available ? `Disponible ${text(r.available_version)}` : r.active ? "Activo" : "Inactivo"}</span>
          </div>)}
        </div>)}
      </div>

      <h3>Alertas técnicas</h3>
      {!data.alerts.length && <p className="muted">Sin alertas visibles.</p>}
      {data.alerts.map((a) => <div className="record" key={a.id}>
        <div><strong>{text(a.title)}</strong><p>{text(a.message)}</p></div><span className="badge">{text(a.severity)}</span>
      </div>)}

      <h3>Historial técnico</h3>
      {!data.diagnostics.length && <p className="muted">Todavía no hay sincronizaciones registradas.</p>}
      {data.diagnostics.map((d, index) => {
        const dHealth = Array.isArray(d.health) ? d.health as Row[] : [];
        const warnings = dHealth.filter((item) => item.status === "warning").length;
        const problems = dHealth.filter((item) => item.status === "problem").length;
        return <div className="record" key={d.id}>
          <div><strong>{index === 0 ? "Última sincronización" : "Sincronización"}</strong><p>{dateLabel(d.captured_at)} · WordPress {text(d.wp_version)} · PHP {text(d.php_version)}</p></div>
          <span className="badge">{problems ? `${problems} problemas` : warnings ? `${warnings} avisos` : "Correcto"}</span>
        </div>;
      })}
      {diagnostic && <p className="notice">Estado actual: {problemCount ? `${problemCount} problemas` : warningCount ? `${warningCount} avisos` : "sin incidencias"}. Cada sincronización del plugin queda guardada en este historial.</p>}
    </>}
  </section>;
}
