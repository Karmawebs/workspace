import { useEffect,useRef,useState,type FormEvent } from "react";
import { Plus,X } from "lucide-react";
import { db } from "../lib/supabase";
import { message,type Scope } from "../core/data";
import { localInput,safeUrl,text,type Row } from "../core/model";

const formats=["post","reel","story"] as const;
const statuses=["draft","review","approved","scheduled","published"] as const;
const labels:Record<string,string>={post:"Post",reel:"Reel",story:"Story",draft:"Borrador",review:"Revisión",approved:"Aprobado",scheduled:"Programado",published:"Publicado"};

export function SocialContentEditor({scope,original,projectId,onClose,onSave}:{scope:Scope;original?:Row;projectId?:string;onClose:()=>void;onSave:(row:Row)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[projects,setProjects]=useState<{id:string;name:string}[]>([]),[urls,setUrls]=useState<string[]>(()=>{
  const raw=original?.file_urls;
  return Array.isArray(raw)&&raw.length?raw.map(text):[""];
 });
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{if(projectId)return;db.from("kw_projects").select("id,name").eq("workspace_id",scope.workspaceId).eq("app_key","social").eq("archived",false).order("name").then(({data,error})=>{if(error)setError(error.message);else setProjects(data||[]);});},[scope.workspaceId,projectId]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");const fd=new FormData(e.currentTarget);
  const title=text(fd.get("title")).trim(),description=text(fd.get("description")).trim(),content_type=text(fd.get("content_type"))||"post",status=text(fd.get("status"))||"draft",scheduled=text(fd.get("scheduled_at")).trim(),selectedProject=projectId||text(fd.get("project_id")).trim()||null;
  if(!title){setError("El título es obligatorio.");return;}
  const cleanUrls=urls.map(v=>v.trim()).filter(Boolean);
  if(cleanUrls.some(v=>!safeUrl(v))){setError("Utiliza URLs http(s) válidas para los archivos.");return;}
  setBusy(true);
  try{
   const payload={workspace_id:scope.workspaceId,project_id:selectedProject,title,description:description||null,content_type,status,scheduled_at:scheduled?new Date(scheduled).toISOString():null,file_urls:cleanUrls,channel:null,assignee_id:null,updated_at:new Date().toISOString()};
   const query=original?.id?db.from("kw_content_items").update(payload).eq("id",text(original.id)).eq("workspace_id",scope.workspaceId):db.from("kw_content_items").insert(payload);
   const {data,error}=await query.select("*").single();if(error)throw error;onSave(data as Row);
  }catch(e){setError(message(e));}finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="editor social-content-editor" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><form onSubmit={submit}>
  <header><div><span className="eyebrow">SOCIAL / CONTENIDO</span><h2>{original?"Editar contenido":"Nuevo contenido"}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose} disabled={busy}><X size={20}/></button></header>
  <div className="form-fields">
   {!projectId&&<label>Cliente / proyecto<select name="project_id" defaultValue={text(original?.project_id)}><option value="">Sin asignar</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   <label>Título *<input name="title" defaultValue={text(original?.title)} required/></label>
   <label>Copy<textarea name="description" defaultValue={text(original?.description)} rows={6}/></label>
   <label>Formato<select name="content_type" defaultValue={text(original?.content_type)||"post"}>{formats.map(v=><option key={v} value={v}>{labels[v]}</option>)}</select></label>
   <label>Estado<select name="status" defaultValue={text(original?.status)||"draft"}>{statuses.map(v=><option key={v} value={v}>{labels[v]}</option>)}</select></label>
   <label>Publicación prevista<input name="scheduled_at" type="datetime-local" defaultValue={localInput(original?.scheduled_at)}/></label>
   <div className="social-file-urls"><span className="social-field-label">URL de archivo</span>{urls.map((url,i)=><div className="social-url-row" key={i}><input type="url" value={url} placeholder="https://drive.google.com/…" onChange={e=>setUrls(v=>v.map((x,j)=>j===i?e.target.value:x))}/>{urls.length>1&&<button type="button" className="icon-button danger" aria-label="Eliminar URL" onClick={()=>setUrls(v=>v.filter((_,j)=>j!==i))}><X size={15}/></button>}</div>)}<button type="button" className="social-add-url" onClick={()=>setUrls(v=>[...v,""])}><Plus size={14}/> Añadir URL</button></div>
  </div>
  {error&&<p className="error" role="alert">{error}</p>}
  <footer><button className="ghost" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button disabled={busy}>{busy?"Guardando…":"Guardar"}</button></footer>
 </form></dialog>;
}
