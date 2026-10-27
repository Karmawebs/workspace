import { useEffect,useState,type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plus,Pencil,Archive,Trash2,Search,ExternalLink,ChevronDown } from "lucide-react";
import { entity,type EntityKey } from "./entities";
import { useRows } from "./useRows";
import { message,removeRow,saveRow,type Scope } from "./data";
import { newLabel,dateLabel,pretty,safeUrl,text,type Row } from "./model";
import { Editor } from "./Editor";
import { WorkJournal } from "./WorkJournal";
import { db } from "../lib/supabase";
import "./care-site-summary.css";

const projectStatusColors:Record<string,{background:string;color:string}>={
 presupuesto:{background:"#FDECEC",color:"#A94A4A"},
 diseño:{background:"#FFF4CC",color:"#8A6A16"},
 cliente:{background:"#E8F1FF",color:"#456B9B"},
 producción:{background:"#F0E9FF",color:"#71549A"},
 produccion:{background:"#F0E9FF",color:"#71549A"},
 listo:{background:"#E7F6EA",color:"#4F7D59"},
};
function projectStatusStyle(value:unknown){return projectStatusColors[text(value).trim().toLowerCase()];}

function CareSiteProgress({row}:{row:Row}){
 const [state,setState]=useState<{total:number;pending:number}|null>(null);
 useEffect(()=>{
  let alive=true;
  const load=async()=>{
   const siteId=text(row.legacy_site_id);
   if(!siteId){if(alive)setState({total:0,pending:0});return;}
   const diagnostic=await db.from("diagnostics").select("id,wp_update_available").eq("site_id",siteId).order("captured_at",{ascending:false}).limit(1).maybeSingle();
   if(diagnostic.error)throw diagnostic.error;
   if(!diagnostic.data){if(alive)setState({total:0,pending:0});return;}
   const [plugins,themes]=await Promise.all([
    db.from("plugin_snapshots").select("id,update_available").eq("diagnostic_id",diagnostic.data.id),
    db.from("theme_snapshots").select("id,update_available").eq("diagnostic_id",diagnostic.data.id),
   ]);
   if(plugins.error||themes.error)throw plugins.error||themes.error;
   const pluginRows=plugins.data||[],themeRows=themes.data||[];
   const total=pluginRows.length+themeRows.length+1;
   const pending=pluginRows.filter(r=>r.update_available).length+themeRows.filter(r=>r.update_available).length+(diagnostic.data.wp_update_available?1:0);
   if(alive)setState({total,pending});
  };
  void load().catch(()=>{if(alive)setState(null)});
  return()=>{alive=false};
 },[row.legacy_site_id]);
 if(!state||state.total===0)return <div className="care-site-health care-site-health--neutral"><div className="care-site-health__track"><span style={{width:"0%"}}/></div><small>Sin diagnóstico</small></div>;
 const pendingRatio=state.pending/state.total;
 const upToDate=Math.max(0,Math.round((1-pendingRatio)*100));
 const tone=state.pending===0?"good":pendingRatio>0.5?"danger":"warning";
 return <div className={`care-site-health care-site-health--${tone}`} aria-label={`Mantenimiento ${upToDate}%, ${state.pending} pendientes`}>
  <div className="care-site-health__top"><span>Mantenimiento</span><strong>{upToDate}%</strong></div>
  <div className="care-site-health__track"><span style={{width:`${upToDate}%`}}/></div>
  <small>{state.pending===0?"Todo actualizado":`${state.pending} ${state.pending===1?"pendiente":"pendientes"}`}</small>
 </div>;
}

export function EntityView({kind,scope,projectId,compact=false,extra}:{kind:EntityKey;scope:Scope;projectId?:string;compact?:boolean;extra?:(row:Row)=>ReactNode}){
 if((scope.app==="work"||scope.app==="care")&&kind==="journal"&&projectId&&compact)return <WorkJournal scope={scope} projectId={projectId}/>;
 const def=entity(kind),{rows,loading,error,reload}=useRows(def,scope,projectId),[edit,setEdit]=useState<Row|null|undefined>(),[query,setQuery]=useState(""),[archived,setArchived]=useState(false),[failure,setFailure]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[projectFilter,setProjectFilter]=useState("");
 const projectCompact=compact&&!!projectId&&(((scope.app==="work"||scope.app==="care")&&(kind==="tasks"||kind==="events"))||(scope.app==="social"&&kind==="tasks"));
 const socialEventCompact=compact&&!!projectId&&scope.app==="social"&&kind==="events";
 const careSite=scope.app==="care"&&kind==="sites";
 const visible=rows.filter(r=>(!def.archive||!!r.archived===archived)&&(!status||text(r.status)===status)&&(!projectFilter||(projectFilter==="none"?!r.project_id:text(r.project_id)===projectFilter))&&[r[def.primary],r.description,r.body,r.company].some(v=>text(v).toLowerCase().includes(query.toLowerCase())));
 async function archive(row:Row){setBusy(true);try{await saveRow(def,scope,{archived:!row.archived},row,projectId);reload();}catch(e){setFailure(message(e));}finally{setBusy(false)}}
 async function remove(row:Row){if(!window.confirm(`¿Eliminar “${text(row[def.primary])}”? Esta acción no se puede deshacer.`))return;setBusy(true);try{await removeRow(def,scope,row);reload();}catch(e){setFailure(message(e));}finally{setBusy(false)}}
 async function toggleTask(row:Row){setBusy(true);try{const done=text(row.status)==="done";await saveRow(def,scope,{status:done?"pending":"done",completed_at:done?null:new Date().toISOString()},row,projectId);reload();}catch(e){setFailure(message(e));}finally{setBusy(false)}}
 function openCareSite(row:Row){const el=document.querySelector(`[data-care-site="${text(row.id)}"] .technical-button`) as HTMLButtonElement|null;el?.click();}
 return <section className={compact?"card section-card":"entity-page"}><header className="section-header"><div>{!compact&&<span className="eyebrow">TU ESPACIO DE {scope.app.toUpperCase()}</span>}<h2>{def.title} <span className="count">{visible.length}</span></h2>{!compact&&<p className="muted">{kind==="projects"?"Una vista clara de lo que está en marcha.":kind==="clients"?"Tus relaciones, compartidas entre Work, Social y Care.":"Todo lo que necesitas, en un mismo lugar."}</p>}</div>{projectCompact&&kind==="tasks"&&<label className="search" style={{maxWidth:260,marginLeft:"auto"}}><Search size={16}/><input aria-label={`Buscar en ${def.title}`} placeholder="Buscar…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}{socialEventCompact&&<label className="search" style={{maxWidth:260,marginLeft:"auto"}}><Search size={16}/><input aria-label={`Buscar en ${def.title}`} placeholder="Buscar…" value={query} onChange={e=>setQuery(e.target.value)}/></label>}<button onClick={()=>setEdit(null)}><Plus size={16}/>{compact?"Añadir":newLabel(def.singular)}</button></header>{!projectCompact&&!socialEventCompact&&<div className="filters"><label className="search"><Search size={16}/><input aria-label={`Buscar en ${def.title}`} placeholder="Buscar…" value={query} onChange={e=>setQuery(e.target.value)}/></label>{def.fields.some(f=>f.key==="status")&&<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos los estados</option>{def.fields.find(f=>f.key==="status")?.options?.map(s=><option key={s} value={s}>{pretty(s)}</option>)}</select>}{kind==="tasks"&&!projectId&&<select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="">Todas las tareas</option><option value="none">Independientes</option></select>}{def.archive&&<label className="check"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Archivados</label>}</div>}{(error||failure)&&<div className="error">{error||failure}</div>}{loading?<p className="empty">Cargando…</p>:visible.length===0?<div className="empty"><div className="empty-symbol">◇</div><h3>Todo empieza aquí</h3><p>Crea {def.singular} para empezar.</p></div>:<div className={kind==="projects"?"project-grid":"record-list"}>{visible.map(row=><article data-care-site={careSite?text(row.id):undefined} className={kind==="projects"?"card project-card":projectCompact?"record compact-record":careSite?"record care-site-record":"record"} key={text(row.id)}><div className="record-main"><div className="record-title">{projectCompact&&kind==="tasks"&&<input className="task-check" type="checkbox" checked={text(row.status)==="done"} onChange={()=>toggleTask(row)} disabled={busy}/>} {kind==="projects"?<Link to={`/${scope.app}/projects/${text(row.id)}`} className="project-link">{text(row[def.primary])}</Link>:careSite?<button className="care-site-title" disabled={!row.legacy_site_id} onClick={()=>openCareSite(row)}>{text(row[def.primary])||"Sin título"}<ChevronDown size={17}/></button>:<button className={`text-button ${kind==="tasks"&&text(row.status)==="done"?"completed":""}`} onClick={()=>setEdit(row)}>{text(row[def.primary])||"Sin título"}</button>}{!projectCompact&&!!text(row.status)&&<span className={`badge ${text(row.status)}`} style={kind==="projects"?projectStatusStyle(row.status):undefined}>{pretty(text(row.status))}</span>}</div>{!projectCompact&&!!text(row.description||row.body||row.message||row.company||row.subtitle)&&<p className="record-description">{text(row.description||row.body||row.message||row.company||row.subtitle)}</p>}{!projectCompact&&<div className="record-meta">{[row.due_date,row.due_at,row.starts_at,row.entry_date,row.scheduled_at].filter(Boolean).slice(0,1).map((d,i)=><span key={i}>{dateLabel(d)}</span>)}{!!text(row.priority)&&<span>{pretty(text(row.priority))}</span>}{!!text(row.channel)&&<span>{text(row.channel)}</span>}{safeUrl(row.url||row.website||row.endpoint)&&<a href={safeUrl(row.url||row.website||row.endpoint)} target="_blank" rel="noreferrer">Abrir enlace <ExternalLink size={12}/></a>}</div>}{careSite&&<CareSiteProgress row={row}/>}<div className={careSite?"care-site-hidden-trigger":undefined}>{extra?.(row)}</div></div><div className="record-actions"><button className="icon-button" onClick={()=>setEdit(row)}><Pencil size={15}/></button>{def.archive&&<button className="icon-button" disabled={busy} onClick={()=>archive(row)}><Archive size={15}/></button>}<button className="icon-button danger" disabled={busy} onClick={()=>remove(row)}><Trash2 size={15}/></button></div></article>)}</div>}{edit!==undefined&&<Editor def={def} scope={scope} original={edit||undefined} projectId={projectId} onClose={()=>setEdit(undefined)} onSave={()=>{setEdit(undefined);reload();}}/>}</section>;
}
