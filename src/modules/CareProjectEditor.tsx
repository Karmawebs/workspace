import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { db } from "../lib/supabase";
import { message, type Scope } from "../core/data";
import type { Row } from "../core/model";
import type { TablesInsert } from "../lib/database.types";

export function CareProjectEditor({ scope, onClose, onSave }: { scope: Scope; onClose: () => void; onSave: (row: Row) => void }) {
  const [plans, setPlans] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      (db as any)
        .from("kw_care_plan_settings")
        .select("plan_type,display_name,monthly_price,active")
        .eq("workspace_id", scope.workspaceId)
        .eq("active", true)
        .order("monthly_price"),
      db
        .from("kw_clients")
        .select("id,name,company")
        .eq("workspace_id", scope.workspaceId)
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]).then(([plansResult, clientsResult]: any[]) => {
      if (plansResult.error) setError(plansResult.error.message);
      else setPlans((plansResult.data as Row[]) || []);

      if (clientsResult.error) setError((current) => current || clientsResult.error.message);
      else setClients((clientsResult.data as Row[]) || []);
    });
  }, [scope.workspaceId]);

  return <div className="modal-backdrop care-project-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal card care-project-modal" role="dialog" aria-modal="true" aria-labelledby="care-new-project-title">
      <header className="care-project-modal-header">
        <div><span className="eyebrow">CARE / PROYECTOS</span><h2 id="care-new-project-title">Nuevo proyecto</h2></div>
        <button type="button" className="icon-button care-project-modal-close" aria-label="Cerrar" onClick={onClose}><X size={20}/></button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <form className="editor-form" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") || "").trim();
          const description = String(fd.get("description") || "").trim();
          const clientId = String(fd.get("client_id") || "").trim() || null;
          const planType = String(fd.get("plan") || "care");
          const plan = plans.find((p) => p.plan_type === planType);
          const planName = typeof plan?.display_name === "string" ? plan.display_name : planType;
          const planPrice = typeof plan?.monthly_price === "number" || typeof plan?.monthly_price === "string" ? Number(plan.monthly_price) : 0;
          if (!name) throw new Error("El nombre es obligatorio.");

          const projectPayload: TablesInsert<"kw_projects"> = {
            workspace_id: scope.workspaceId,
            app_key: "care",
            name,
            description: description || null,
            client_id: clientId,
            status: "activo",
            priority: "normal",
            start_date: new Date().toISOString().slice(0, 10),
            metadata: {
              care_plan_type: planType,
              care_plan_name: planName,
              care_plan_price: planPrice,
            },
          };
          const { data: project, error: projectError } = await db.from("kw_projects").insert(projectPayload).select("*").single();
          if (projectError) throw projectError;

          const sitePayload: TablesInsert<"kw_care_sites"> = {
            workspace_id: scope.workspaceId,
            project_id: project.id,
            domain: "",
            status: "pending",
            metadata: { plan_type: planType },
          };
          const { error: siteError } = await db.from("kw_care_sites").insert(sitePayload);
          if (siteError) {
            await db.from("kw_projects").delete().eq("id", project.id);
            throw siteError;
          }
          onSave(project as Row);
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}>
        <label>Nombre<input name="name" required autoFocus/></label>
        <label>Descripción<textarea name="description" rows={4}/></label>
        <label>Cliente<select name="client_id" defaultValue=""><option value="">Sin asignar</option>{clients.map((client) => <option key={String(client.id)} value={String(client.id)}>{String(client.name)}</option>)}</select></label>
        <label>Tipo de mantenimiento<select name="plan" required>{plans.map((p) => <option key={String(p.plan_type)} value={String(p.plan_type)}>{String(p.display_name)} · {Number(p.monthly_price || 0)} €/mes</option>)}</select></label>
        <div className="editor-actions"><button type="button" className="ghost" onClick={onClose}>Cancelar</button><button disabled={busy || !plans.length}>{busy ? "Creando…" : "Crear proyecto"}</button></div>
      </form>
    </section>
  </div>;
}
