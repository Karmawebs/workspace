import { useEffect, useState } from "react";
import { db } from "../lib/supabase";
import { message, type Scope } from "../core/data";
import { text, type Row } from "../core/model";

export function CareSettings({ scope }: { scope: Scope }) {
  const [plans, setPlans] = useState<Row[]>([]), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const load = () => db.from("kw_care_plan_settings").select("*").eq("workspace_id", scope.workspaceId).order("monthly_price").then(({ data, error }) => { if (error) setError(error.message); else setPlans((data as Row[]) || []); });
  useEffect(() => { load(); }, [scope.workspaceId]);
  return <><header className="page-heading"><div><span className="eyebrow">CARE</span><h1>Configuración</h1><p className="muted">Planes de mantenimiento aplicados automáticamente a los nuevos proyectos.</p></div></header>{error && <p className="error" role="alert">{error}</p>} {saved && <p className="notice">{saved}</p>}<div className="settings-grid">{plans.map((plan) => <form className="card care-plan-card" key={text(plan.plan_type)} onSubmit={async (e) => { e.preventDefault(); setError(""); setSaved(""); const fd = new FormData(e.currentTarget); const { error } = await db.from("kw_care_plan_settings").update({ display_name: String(fd.get("name") || ""), monthly_price: Number(fd.get("price") || 0), active: fd.get("active") === "on", updated_at: new Date().toISOString() }).eq("workspace_id", scope.workspaceId).eq("plan_type", plan.plan_type); if (error) setError(message(error)); else { setSaved("Plan actualizado."); load(); } }}><span className="eyebrow">{text(plan.plan_type).replace("_", " ")}</span><label>Nombre<input name="name" defaultValue={text(plan.display_name)} required /></label><label>Precio mensual (€)<input name="price" type="number" min="0" step="0.01" defaultValue={Number(plan.monthly_price || 0)} required /></label><label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={!!plan.active} /> Plan activo</label><button>Guardar cambios</button></form>)}</div></>;
}
