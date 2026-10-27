import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { db } from "../lib/supabase";
import { message, type Scope } from "../core/data";
import { text, type Row } from "../core/model";

function planTypeFromName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `plan_${Date.now()}`;
}

export function CareSettings({ scope }: { scope: Scope }) {
  const [plans, setPlans] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const table = () => (db as any).from("kw_care_plan_settings");
  const load = () => table()
    .select("*")
    .eq("workspace_id", scope.workspaceId)
    .order("monthly_price")
    .then(({ data, error }: any) => {
      if (error) setError(error.message);
      else setPlans((data as Row[]) || []);
    });

  useEffect(() => { load(); }, [scope.workspaceId]);

  const removePlan = async (plan: Row) => {
    const name = text(plan.display_name) || text(plan.plan_type);
    if (!window.confirm(`¿Eliminar el plan “${name}”?\n\nLos proyectos que ya lo tengan asignado conservarán su información histórica.`)) return;
    setError("");
    setSaved("");
    const { error } = await table()
      .delete()
      .eq("workspace_id", scope.workspaceId)
      .eq("plan_type", plan.plan_type);
    if (error) setError(message(error));
    else {
      setSaved("Plan eliminado.");
      load();
    }
  };

  return <>
    <header className="page-heading care-settings-heading">
      <div>
        <span className="eyebrow">CARE</span>
        <h1>Configuración</h1>
        <p className="muted">Gestiona los planes de mantenimiento disponibles para los proyectos de Care.</p>
      </div>
      <button type="button" className="care-add-plan-button" onClick={() => setCreating((value) => !value)}>
        <Plus size={17}/> {creating ? "Cancelar" : "Nuevo plan"}
      </button>
    </header>

    {error && <p className="error" role="alert">{error}</p>}
    {saved && <p className="notice">{saved}</p>}

    <div className="settings-grid">
      {plans.map((plan) => <form
        className="card care-plan-card"
        key={text(plan.plan_type)}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setSaved("");
          const fd = new FormData(e.currentTarget);
          const { error } = await table().update({
            display_name: String(fd.get("name") || "").trim(),
            monthly_price: Number(fd.get("price") || 0),
            active: fd.get("active") === "on",
            updated_at: new Date().toISOString(),
          }).eq("workspace_id", scope.workspaceId).eq("plan_type", plan.plan_type);
          if (error) setError(message(error));
          else {
            setSaved("Plan actualizado.");
            load();
          }
        }}
      >
        <div className="care-plan-card-top">
          <span className="eyebrow">{text(plan.plan_type).replaceAll("_", " ")}</span>
          <button type="button" className="icon-button care-plan-delete" aria-label={`Eliminar ${text(plan.display_name)}`} title="Eliminar plan" onClick={() => removePlan(plan)}>
            <Trash2 size={16}/>
          </button>
        </div>
        <label>Nombre<input name="name" defaultValue={text(plan.display_name)} required/></label>
        <label>Precio mensual (€)<input name="price" type="number" min="0" step="0.01" defaultValue={Number(plan.monthly_price || 0)} required/></label>
        <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={!!plan.active}/> Plan activo</label>
        <button>Guardar cambios</button>
      </form>)}

      {creating && <form className="card care-plan-card care-plan-card-new" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved("");
        try {
          const fd = new FormData(e.currentTarget);
          const displayName = String(fd.get("name") || "").trim();
          const planType = planTypeFromName(displayName);
          if (!displayName) throw new Error("El nombre es obligatorio.");
          if (plans.some((plan) => text(plan.plan_type) === planType)) throw new Error("Ya existe un plan con ese nombre.");
          const { error } = await table().insert({
            workspace_id: scope.workspaceId,
            plan_type: planType,
            display_name: displayName,
            monthly_price: Number(fd.get("price") || 0),
            active: true,
            updated_at: new Date().toISOString(),
          });
          if (error) throw error;
          setSaved("Plan creado.");
          setCreating(false);
          load();
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="care-plan-card-top">
          <span className="eyebrow">nuevo plan</span>
          <button type="button" className="icon-button care-plan-delete" aria-label="Cancelar nuevo plan" onClick={() => setCreating(false)}>×</button>
        </div>
        <label>Nombre<input name="name" placeholder="Ej. Mantenimiento" required autoFocus/></label>
        <label>Precio mensual (€)<input name="price" type="number" min="0" step="0.01" defaultValue={0} required/></label>
        <label className="checkbox-row"><input type="checkbox" defaultChecked disabled/> Plan activo</label>
        <button disabled={busy}>{busy ? "Creando…" : "Crear plan"}</button>
      </form>}

      {!creating && <button type="button" className="care-plan-add-card" onClick={() => setCreating(true)}>
        <span className="care-plan-add-icon"><Plus size={22}/></span>
        <strong>Añadir nuevo plan</strong>
        <small>Crea un nuevo plan de mantenimiento</small>
      </button>}
    </div>
  </>;
}
