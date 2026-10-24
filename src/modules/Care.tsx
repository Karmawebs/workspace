import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
import { EntityView } from "../core/EntityView";
import { message, type Scope } from "../core/data";
import { dateLabel, text, type Row } from "../core/model";
export function Care({
  scope,
  projectId,
}: {
  scope: Scope;
  projectId?: string;
}) {
  const [site, setSite] = useState<Row>();
  return (
    <>
      <EntityView
        kind="sites"
        scope={scope}
        projectId={projectId}
        extra={(row) => (
          <button
            className="secondary technical-button"
            disabled={!row.legacy_site_id}
            onClick={() => setSite(row)}
          >
            {row.legacy_site_id
              ? "Ver diagnóstico y conexión"
              : "Sin vínculo técnico"}
          </button>
        )}
      />
      {site && <Technical site={site} close={() => setSite(undefined)} />}
    </>
  );
}
function Technical({ site, close }: { site: Row; close: () => void }) {
  const [data, setData] = useState<Record<string, Row[]>>(),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const id = text(site.legacy_site_id);
      const responses = await Promise.all([
        db
          .from("diagnostics")
          .select(
            "id,captured_at,wp_version,php_version,https,health,wp_update_available",
          )
          .eq("site_id", id)
          .order("captured_at", { ascending: false })
          .limit(1),
        db
          .from("installations")
          .select("id,plugin_version,connected_at,last_seen_at")
          .eq("site_id", id)
          .limit(1),
        db
          .from("alerts")
          .select("id,title,severity,message,status")
          .eq("site_id", id)
          .eq("status", "open")
          .limit(50),
        db
          .from("action_jobs")
          .select("id,action_type,status,requested_at,progress_message")
          .eq("site_id", id)
          .order("requested_at", { ascending: false })
          .limit(20),
      ]);
      for (const r of responses) if (r.error) throw r.error;
      const result: Record<string, Row[]> = {
        diagnostic: (responses[0].data as Row[]) || [],
        installation: (responses[1].data as Row[]) || [],
        alerts: (responses[2].data as Row[]) || [],
        jobs: (responses[3].data as Row[]) || [],
      };
      const diagnostic = result.diagnostic[0];
      if (diagnostic) {
        const [plugins, themes] = await Promise.all([
          db
            .from("plugin_snapshots")
            .select("id,name,version,active,update_available,available_version")
            .eq("diagnostic_id", diagnostic.id),
          db
            .from("theme_snapshots")
            .select("id,name,version,active,update_available,available_version")
            .eq("diagnostic_id", diagnostic.id),
        ]);
        if (plugins.error || themes.error) throw plugins.error || themes.error;
        result.plugins = (plugins.data as Row[]) || [];
        result.themes = (themes.data as Row[]) || [];
      }
      if (alive) setData(result);
    })().catch((e) => alive && setError(message(e)));
    return () => {
      alive = false;
    };
  }, [site.id]);
  const diagnostic = data?.diagnostic[0],
    installation = data?.installation[0];
  return (
    <section className="card technical-panel">
      <header className="section-header">
        <div>
          <span className="eyebrow">CARE / DIAGNÓSTICO</span>
          <h2>{text(site.domain)}</h2>
        </div>
        <button className="ghost" onClick={close}>
          Cerrar diagnóstico
        </button>
      </header>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Consultando diagnóstico…</p>
      ) : (
        <>
          <div className="stats-grid">
            <div>
              <small>WordPress</small>
              <strong>{text(diagnostic?.wp_version) || "Sin datos"}</strong>
            </div>
            <div>
              <small>PHP</small>
              <strong>{text(diagnostic?.php_version) || "Sin datos"}</strong>
            </div>
            <div>
              <small>Plugin Care</small>
              <strong>
                {text(installation?.plugin_version) || "Sin conexión"}
              </strong>
            </div>
            <div>
              <small>Último contacto</small>
              <strong className="small-stat">
                {dateLabel(installation?.last_seen_at) || "Sin datos"}
              </strong>
            </div>
          </div>
          <p className="muted">
            Diagnóstico:{" "}
            {dateLabel(diagnostic?.captured_at) || "Todavía no disponible"}
          </p>
          <div className="operations-grid">
            {["plugins", "themes"].map((key) => (
              <div key={key}>
                <h3>{key === "plugins" ? "Plugins" : "Temas"}</h3>
                {!data[key]?.length && <p className="muted">Sin registros.</p>}
                {data[key]?.map((r) => (
                  <div className="record" key={r.id}>
                    <span>
                      {text(r.name)} <small>{text(r.version)}</small>
                    </span>
                    <span className="badge">
                      {r.update_available
                        ? `Disponible ${text(r.available_version)}`
                        : r.active
                          ? "Activo"
                          : "Inactivo"}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <h3>Alertas técnicas</h3>
          {!data.alerts.length && (
            <p className="muted">Sin alertas visibles.</p>
          )}
          {data.alerts.map((a) => (
            <div className="record" key={a.id}>
              <div>
                <strong>{text(a.title)}</strong>
                <p>{text(a.message)}</p>
              </div>
              <span className="badge">{text(a.severity)}</span>
            </div>
          ))}
          <h3>Acciones remotas · Historial</h3>
          {data.jobs.map((j) => (
            <div className="record" key={j.id}>
              <span>
                {text(j.action_type)} · {text(j.progress_message)}
              </span>
              <span className="badge">{text(j.status)}</span>
            </div>
          ))}
          <p className="notice">
            Las actualizaciones remotas se siguen ejecutando desde Care actual.
            Aquí puedes consultar su estado. El emparejamiento y las
            credenciales del plugin permanecen en Care.
          </p>
        </>
      )}
    </section>
  );
}
