import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { entity } from "../core/entities";
import { useRows } from "../core/useRows";
import type { Scope } from "../core/data";
import { saveRow } from "../core/data";
import { text,type Row } from "../core/model";
import { Editor } from "../core/Editor";
const columns=[{key:"presupuesto",label:"Presupuesto"},{key:"diseño",label:"Diseño"},{key:"cliente",label:"Cliente"},{key:"producción",label:"Producción"},{key:"listo",label:"Listo"}];
export function Dashboard({scope}:{scope:Scope}){
 const projects=useRows(entity("projects"),scope),tasks=useRows(entity("tasks"),scope),[editTask,setEditTask]=useState(false),[busy,setBusy]=useState(false),[failure,setFailure]=useState("");
 const loose=tasks.rows.filter(t=>!t.project_id&&t.status!=="done"&&t.status!=="cancelled");
 async function move(row:Row,status:string){if(text(row.status)===status)return;setBusy(true);setFailure("");try{await saveRow(entity("projects"),scope,{status},row);projects.reload();}catch(e){setFailure(e instanceof Error?e.message:"No se pudo mover el proyecto");}finally{setBusy(false)}}
 async function toggle(row:Row){setBusy(true);try{await saveRow(entity("tasks"),scope,{status:"done",completed_at:new Date().toISOString()},row);tasks.reload();}finally{setBusy(false)}}
 return <><header className="page-heading"><div><span className="eyebrow">WORK / RESUMEN</span><h1>Tu espacio de trabajo</h1><p className="muted">Proyectos y tareas, sin ruido.</p></div></header>{failure&&<p className="error">{failure}</p>}<div className="work-dashboard"><section className="work-kanban">{columns.map(col=>{const rows=projects.rows.filter(p=>!p.archived&&text(p.status)===col.key);return <div className="kanban-column" key={col.key} onDragOver={e=>e.preventDefault()} onDrop={e=>{const id=e.dataTransfer.getData("text/project-id"),row=projects.rows.find(p=>text(p.id)===id);if(row)move(row,col.key);}}><header><span>{col.label}</span><strong>{rows.length}</strong></header><div className="kanban-stack">{rows.map(row=><Link draggable onDragStart={e=>e.dataTransfer.setData("text/project-id",text(row.id))} className="kanban-card" to={`/work/projects/${text(row.id)}`} key={text(row.id)}><strong>{text(row.name)}</strong>{Boolean(row.category)&&<small>{text(row.category)}</small>}</Link>)}</div></div>})}</section><aside className="loose-tasks card"><header><div><span className="eyebrow">TAREAS SUELTAS</span><h2>Pendientes <span className="count">{loose.length}</span></h2></div><button className="icon-button" onClick={()=>setEditTask(true)}><Plus size={17}/></button></header><div className="loose-task-list">{loose.length?loose.map(row=><label className="loose-task" key={text(row.id)}><input type="checkbox" disabled={busy} onChange={()=>toggle(row)}/><span>{text(row.title)}</span></label>):<p className="muted">Nada pendiente.</p>}</div></aside></div>{editTask&&<Editor def={entity("tasks")} scope={scope} onClose={()=>setEditTask(false)} onSave={()=>{setEditTask(false);tasks.reload();}}/>}</>;
}
