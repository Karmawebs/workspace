import {deliver} from "./mail.ts";
import {handleDrive as driveList} from "../_shared/drive-list.ts";
import {handleDrive as driveFile} from "../_shared/drive-download.ts";
import {admin,cors,json,Failure} from "../_shared/social-drive.ts";

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Método no disponible"},405);
 try{
 const b=await req.json();
 if(b.action==="deliver")return await deliver(b);
 const jwt=req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!jwt)throw new Failure("Inicia sesión en el portal.",401);
 const db=admin();
 const {data:{user},error}=await db.auth.getUser(jwt);
 if(error||user?.role!=="kw_portal_client")throw new Failure("Acceso no disponible.",403);
 const session=JSON.parse(atob(jwt.split(".")[1].replaceAll("-","+").replaceAll("_","/"))).session_id;
 const {data:a}=await db.rpc("kw_portal_authorize",{p_user:user.id,p_session:session}).maybeSingle();
 const access=a as {project_id:string,name:string,preferences:string[]}|null;
 if(!access)throw new Failure("Acceso no disponible.",403);
 const project=access.project_id;
 if(b.action==="drive-list"||b.action==="drive-file"){
 const {data:p}=await db.from("kw_projects").select("workspace_id").eq("id",project).single();
 if(!p)throw new Failure("Proyecto no disponible.",403);
 const input=new Request(req.url,{method:"POST",body:JSON.stringify({folderId:b.folderId,pageToken:b.pageToken,fileId:b.fileId,projectId:project})});
 return (b.action==="drive-list"?driveList:driveFile)(input,async()=>({db,user:user.id,session,workspace:p.workspace_id,projectId:project}));
 }
 if(b.action==="preferences"){
 if(!Array.isArray(b.preferences)||!b.preferences.every((x:unknown)=>typeof x==="string"&&["new","modified","scheduled","published","reply"].includes(x)))throw new Failure("Preferencias no válidas.",400);
 const {error}=await db.from("kw_portal_access").update({preferences:[...new Set(b.preferences)]}).eq("user_id",user.id).eq("project_id",project).eq("active",true);if(error)throw error;return json({ok:true});
 }
 if(b.action==="snapshot"){
 const offset=Number(b.offset??0);
 if(!Number.isSafeInteger(offset)||offset<0)throw new Failure("Página no válida.",400);
 const {data,error}=await db.from("kw_social_content_delivery").select("id,title,description,content_type,calendar_at").eq("project_id",project).order("id").range(offset,offset+99);
 if(error)throw error;
 const ids=data.map(c=>c.id);
 const reviews=ids.length?await db.from("kw_portal_reviews").select("content_id,status,revision").in("content_id",ids):{data:[],error:null};
 if(reviews.error)throw reviews.error;
 const byId=new Map(reviews.data?.map(r=>[r.content_id,r]));
 return json({name:access.name,items:data.map(c=>({...c,status:byId.get(c.id)?.status??"pending",revision:byId.get(c.id)?.revision??0})),preferences:access.preferences});
 }
 if(b.action==="review"){
 const {error}=await db.rpc("kw_portal_review",{p_user:user.id,p_session:session,p_content:b.id,p_revision:b.revision,p_event:b.event,p_comment:b.comment??"",p_request:b.request});
 if(error)throw new Failure("No se pudo registrar. Actualiza el contenido e inténtalo de nuevo.",409);
 return json({ok:true});
 }
 if(b.action==="preview"){
 const {data:c}=await db.from("kw_content_items").select("id,workspace_id").eq("id",b.id).eq("project_id",project).maybeSingle();
 if(!c)throw new Failure("Contenido no disponible.",404);
 const {data:files,error}=await db.from("kw_content_files").select("id,mime_type,storage_path").eq("content_id",c.id).eq("workspace_id",c.workspace_id).order("sort_order");
 if(error)throw error;
 const media=await Promise.all(files.map(async f=>{
 if(!f.storage_path.startsWith(c.workspace_id+"/"+f.id+"/")||!/^original\.[a-z0-9]+$/i.test(f.storage_path.split("/").at(-1))||f.storage_path.split("/").length!==3)throw new Failure("Archivo no disponible.",404);
 const {data,error}=await db.storage.from("social-media").createSignedUrl(f.storage_path,300);
 if(error)throw error;
 return {url:data.signedUrl,type:f.mime_type};
 }));
 const {data:history,error:h}=await db.from("kw_portal_history").select("event,comment,created_at").eq("project_id",project).eq("content_id",c.id).order("created_at",{ascending:false});
 if(h)throw h;return json({media,history});
 }
 if(b.action==="credentials"){
 const {data,error}=await db.from("kw_portal_credentials").select("id,service").eq("project_id",project).eq("visible",true).order("service");if(error)throw error;return json({items:data});
 }
 if(b.action==="reveal"){
 const {data,error}=await db.rpc("kw_portal_credential",{p_action:"client-reveal",p_project:project,p_id:b.id});if(error)throw new Failure("Credencial no disponible.",404);return json({value:data});
 }
 throw new Failure("Acción no disponible.",400);
 }catch(e){return json({error:e instanceof Failure?e.message:"No se pudo completar la operación."},e instanceof Failure?e.status:500);}
});
