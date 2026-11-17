import {useEffect,useRef,useState} from "react";
import {FileText,Paperclip,Plus,Trash2,ExternalLink} from "lucide-react";
import {createClient} from "@supabase/supabase-js";
import {config} from "../lib/supabase";
import {db} from "../lib/supabase";
import {message,type Scope} from "../core/data";

const api=createClient(config.url,config.key);
type Attachment={id:string;original_filename:string;storage_path:string;mime_type:string;size:number};
const allowed=/\.(pdf|jpe?g|png|webp|gif|docx?|xlsx?|pptx?|txt|csv|zip)$/i;
export function SocialAttachments({scope,projectId}:{scope:Scope;projectId:string}){
 const [items,setItems]=useState<Attachment[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const input=useRef<HTMLInputElement>(null);
 const reload=async()=>{const {data,error}=await api.from("kw_social_attachments").select("id,original_filename,storage_path,mime_type,size").eq("workspace_id",scope.workspaceId).eq("project_id",projectId).order("created_at",{ascending:false});if(error)setError(error.message);else setItems((data||[]) as Attachment[]);};
 useEffect(()=>{void reload();},[scope.workspaceId,projectId]);
 const upload=async(files:FileList|null)=>{if(!files?.length)return;setBusy(true);setError("");try{for(const file of Array.from(files)){if(!allowed.test(file.name))throw new Error("Formato no admitido: "+file.name);if(!file.size||file.size>52428800)throw new Error("El archivo debe tener entre 1 byte y 50 MB: "+file.name);const path=`${scope.workspaceId}/${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;const uploaded=await db.storage.from("social-attachments").upload(path,file,{contentType:file.type||"application/octet-stream"});if(uploaded.error)throw uploaded.error;const inserted=await api.from("kw_social_attachments").insert({workspace_id:scope.workspaceId,project_id:projectId,storage_path:path,original_filename:file.name,mime_type:file.type||"application/octet-stream",size:file.size,created_by:scope.userId});if(inserted.error){await db.storage.from("social-attachments").remove([path]);throw inserted.error;}}await reload();}catch(e){setError(message(e));await reload();}finally{setBusy(false);if(input.current)input.current.value="";}};
 const view=async(item:Attachment)=>{setError("");const {data,error}=await db.storage.from("social-attachments").createSignedUrl(item.storage_path,600,{download:false});if(error){setError(error.message);return;}window.open(data.signedUrl,"_blank","noopener,noreferrer");};
 const remove=async(item:Attachment)=>{if(!confirm(`¿Eliminar "${item.original_filename}"?`))return;setBusy(true);setError("");const deleted=await db.storage.from("social-attachments").remove([item.storage_path]);if(deleted.error){setError(deleted.error.message);setBusy(false);return;}const result=await api.from("kw_social_attachments").delete().eq("id",item.id).eq("workspace_id",scope.workspaceId).eq("project_id",projectId);if(result.error)setError(result.error.message);await reload();setBusy(false);};
 return <div className="social-attachments">
  <div className="social-attachments-toolbar"><p className="muted">Archivos del proyecto · máximo 50 MB por archivo.</p><button type="button" disabled={busy} onClick={()=>input.current?.click()}><Plus size={16}/>{busy?"Subiendo…":"Subir adjuntos"}</button><input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" hidden onChange={e=>void upload(e.target.files)}/></div>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="social-attachments-list">{items.length?items.map(item=><div className="social-attachments-row" key={item.id}><button type="button" className="social-attachments-open" onClick={()=>void view(item)} title="Abrir archivo">{item.mime_type.startsWith("image/")?<Paperclip size={17}/>:<FileText size={17}/>}<span>{item.original_filename}</span><ExternalLink size={15}/></button><button type="button" className="social-attachments-delete" disabled={busy} aria-label={`Eliminar ${item.original_filename}`} onClick={()=>void remove(item)}><Trash2 size={16}/></button></div>):<p className="muted">Todavía no hay archivos adjuntos.</p>}</div>
 </div>;
}
