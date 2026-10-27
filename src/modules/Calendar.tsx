import { useEffect,useMemo,useState } from "react";
import { ChevronLeft,ChevronRight,Plus } from "lucide-react";
import { type Scope } from "../core/data";
import { dayKey,text,type Row } from "../core/model";
import { db } from "../lib/supabase";
import { SocialContentEditor } from "./SocialContentEditor";

const formatLabel:Record<string,string>={post:"Post",reel:"Reel",story:"Story"};
function drivePreview(url:string){
 try{const u=new URL(url);if(!u.hostname.includes("drive.google.com"))return url;const match=u.pathname.match(/\/file\/d\/([^/]+)/);const id=match?.[1]||u.searchParams.get("id");return id?`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w600`:url;}catch{return url;}
}
function itemsForDay(rows:Row[],date:Date){return rows.filter(r=>{if(!r.scheduled_at)return false;return dayKey(new Date(text(r.scheduled_at)))===dayKey(date)}).sort((a,b)=>text(a.scheduled_at).localeCompare(text(b.scheduled_at)));}
export function Calendar({scope}:{scope:Scope}){
 const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1)),[edit,setEdit]=useState<Row|null|undefined>(),[rows,setRows]=useState<Row[]>([]),[projects,setProjects]=useState<{id:string;name:string}[]>([]),[projectFilter,setProjectFilter]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=async()=>{setLoading(true);setError("");const [content,projectRows]=await Promise.all([db.from("kw_content_items").select("*").eq("workspace_id",scope.workspaceId).order("scheduled_at"),db.from("kw_projects").select("id,name").eq("workspace_id",scope.workspaceId).eq("app_key","social").eq("archived",false).order("name")]);if(content.error||projectRows.error)setError(content.error?.message||projectRows.error?.message||"Error");else{setRows((content.data||[]) as Row[]);setProjects(projectRows.data||[]);}setLoading(false);};
 useEffect(()=>{void load();},[scope.workspaceId]);
 const visible=useMemo(()=>rows.filter(r=>!projectFilter||text(r.project_id)===projectFilter),[rows,projectFilter]);
 const offset=(month.getDay()+6)%7,first=new Date(month);first.setDate(1-offset);const days=Array.from({length:42},(_,i)=>new Date(first.getFullYear(),first.getMonth(),first.getDate()+i));
 return <section className="social-calendar-page">
  <header className="section-header"><div><span className="eyebrow">SOCIAL / PLANIFICADOR</span><h1>Calendario</h1><p className="muted">Planificación visual del contenido por cliente.</p></div><button onClick={()=>setEdit(null)}><Plus size={16}/>Nuevo contenido</button></header>
  <div className="social-calendar-controls"><label>Cliente<select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="">Todos los clientes</option>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="social-format-legend"><span><i className="social-dot post"/>Post</span><span><i className="social-dot reel"/>Reel</span><span><i className="social-dot story"/>Story</span></div></div>
  <div className="calendar-toolbar"><h2>{new Intl.DateTimeFormat("es",{month:"long",year:"numeric"}).format(month)}</h2><div><button className="icon-button" aria-label="Mes anterior" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft/></button><button className="ghost" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Hoy</button><button className="icon-button" aria-label="Mes siguiente" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight/></button></div></div>
  {error&&<p className="error">{error}</p>}{loading?<p role="status">Cargando calendario…</p>:<div className="calendar-scroll"><div className="calendar-grid social-calendar-grid">{["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d=><div className="weekday" key={d}>{d}</div>)}{days.map(d=><div className={`calendar-day ${d.getMonth()!==month.getMonth()?"outside":""} ${dayKey(d)===dayKey(new Date())?"today":""}`} key={dayKey(d)}><span className="day-number">{d.getDate()}</span><div className="social-day-dots">{itemsForDay(visible,d).map(r=>{const urls=Array.isArray(r.file_urls)?r.file_urls.map(text).filter(Boolean):[];const preview=urls[0]?drivePreview(urls[0]):"";const type=["post","reel","story"].includes(text(r.content_type))?text(r.content_type):"post";return <button className={`social-calendar-dot ${type}`} key={text(r.id)} aria-label={`${formatLabel[type]||type}: ${text(r.title)}`} onClick={()=>setEdit(r)}><span className="social-calendar-preview">{preview?<img src={preview} alt="" onError={e=>{e.currentTarget.style.display="none"}}/>:<div className={`social-preview-placeholder ${type}`}>{formatLabel[type]||"Contenido"}</div>}<strong>{text(r.title)}</strong><small>{formatLabel[type]||type}</small></span></button>})}</div></div>)}</div></div>}
  {edit!==undefined&&<SocialContentEditor scope={scope} original={edit||undefined} projectId={projectFilter||undefined} onClose={()=>setEdit(undefined)} onSave={()=>{setEdit(undefined);void load();}}/>}
 </section>;
}
