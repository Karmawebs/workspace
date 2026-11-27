import {invite,requestId,generatedPassword} from "./invitations.ts";
import {scope,cors,json,Failure} from "../_shared/social-drive.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Método no válido"},405);
 try{
 const b=await req.json();const {db,user,projectId,session}=await scope(req,b.projectId);
 const {data:live,error:sessionError}=await db.rpc("kw_portal_admin_session",{p_user:user,p_session:session,p_project:projectId});
 if(sessionError||!live)throw new Failure("La sesión ha caducado. Vuelve a iniciar sesión.",401);
 const email=String(b.email??"").trim().toLowerCase(),name=String(b.name??"").trim();
 const checkName=()=>{if(!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>150)throw new Failure("Revisa el nombre y el correo.",400)};
 const checkPassword=()=>{if(typeof b.password!=="string"||b.password.length<12||b.password.length>128)throw new Failure("Utiliza entre 12 y 128 caracteres.",400)};
 if(b.action==="create"){
 checkName();const request=requestId(b.request);
 const {data:existing,error:lookup}=await db.from("kw_portal_access").select("user_id,login_email,creation_request").eq("project_id",projectId).eq("contact_email",email).maybeSingle();
 if(lookup)throw Error();
 if(existing){
  if(existing.creation_request!==request)throw new Failure("Ya existe un usuario con este correo de contacto en el proyecto.",409);
  return json({login:existing.login_email,...await invite(db,projectId,existing.user_id,request)});
 }
 // Dedicated identity always: contact email can be reused across projects.
 const login="cliente-"+crypto.randomUUID()+"@portal.invalid";
 const r=await db.auth.admin.createUser({email:login,password:generatedPassword(),email_confirm:true,role:"kw_portal_client",app_metadata:{portal:"social",project:projectId,name,contact:email,creation_request:request}});
 if(r.error)throw new Failure("No se pudo crear el acceso. Comprueba si ya existe en este proyecto.",409);
 return json({login:r.data.user.email,...await invite(db,projectId,r.data.user.id,request)});
 }
 if(b.action==="list"){
 const access=await db.from("kw_portal_access").select("user_id,name,contact_email,login_email,active,invitation_state,invitation_sent_at,preferences").eq("project_id",projectId).order("name");
 const history=await db.from("kw_portal_history").select("id,event,actor,content_id,comment,created_at,parent_id,kw_content_items(title,project_id)").eq("project_id",projectId).in("event",["changes","reply","approved","pending"]).order("created_at",{ascending:false}).limit(100);
 const credentials=await db.from("kw_portal_credentials").select("id,service,visible").eq("project_id",projectId).order("service");
 if(access.error||history.error||credentials.error)throw Error();
 const clients=new Map(access.data.map(a=>[a.user_id,a.name]));
 const activity=history.data.map(({kw_content_items,actor,...h})=>{
 const c=Array.isArray(kw_content_items)?kw_content_items[0]:kw_content_items;
 return {...h,title:c?.project_id===projectId?c.title:null,client:clients.get(actor)??null};
 });
 // Project credentials stay encrypted at rest. Only this field leaves the server in a list.
 const summaries=await Promise.all(credentials.data.map(async c=>{
 const {data:value,error}=await db.rpc("kw_portal_credential",{p_project:projectId,p_id:c.id,p_action:"reveal"});
 if(error)throw Error();return {...c,username:typeof value?.username==="string"?value.username:""};
 }));
 return json({access:access.data,history:activity,credentials:summaries});}
 if(b.action==="reply"){const {error}=await db.rpc("kw_portal_reply",{p_project:projectId,p_parent:b.parent,p_comment:b.comment,p_actor:user,p_request:b.request});if(error)throw error;return json({ok:true});}
 if(b.action==="credential"){
 if(!["create","reveal","delete","update"].includes(b.op))throw new Failure("Operación no válida",400);
 if(["create","update"].includes(b.op)&&(!b.service?.trim()||typeof b.value!=="object"||!b.value||JSON.stringify(b.value).length>16000))throw new Failure("Revisa los campos.",400);
 const {data,error}=await db.rpc("kw_portal_credential",{p_action:b.op,p_project:projectId,p_id:b.id,p_service:b.service,p_value:b.value,p_visible:b.visible===true});if(error)throw error;return json({value:data});}
 const {data:a}=await db.from("kw_portal_access").select("user_id").eq("project_id",projectId).eq("user_id",b.id).maybeSingle();if(!a)throw new Failure("Acceso no disponible.",404);
 if(b.action==="preferences"){
 const kinds=["new","modified","scheduled","published","reply"];
 if(!Array.isArray(b.preferences)||b.preferences.length>kinds.length||b.preferences.some((k:unknown)=>typeof k!=="string"||!kinds.includes(k)))throw new Failure("Preferencias no válidas.",400);
 const preferences=kinds.filter(k=>b.preferences.includes(k));
 const {data:updated,error}=await db.from("kw_portal_access").update({preferences}).eq("project_id",projectId).eq("user_id",a.user_id).select("user_id").maybeSingle();
 if(error||!updated)throw Error();
 return json({ok:true,preferences});
 }
 if(b.action==="invite"){return json(await invite(db,projectId,a.user_id,requestId(b.request)));}
 if(b.action==="reset"){
 checkPassword();const {data}=await db.auth.admin.getUserById(a.user_id);
 if(data.user?.role!=="kw_portal_client")throw new Failure("Acceso no disponible.",403);
 const result=await db.auth.admin.updateUserById(a.user_id,{password:b.password});if(result.error)throw Error();
 }else if(b.action==="edit")checkName();else if(b.action!=="active"||typeof b.active!=="boolean")throw new Failure("Operación no válida.",400);
 const {error}=await db.from("kw_portal_access").update(b.action==="edit"?{name,contact_email:email}:{valid_after:new Date().toISOString(),...(b.action==="active"?{active:b.active}:{})}).eq("project_id",projectId).eq("user_id",a.user_id);
 if(error)throw error;return json({ok:true});
 }catch(e){return json({error:e instanceof Failure?e.message:"No se pudo completar la operación."},e instanceof Failure?e.status:500);}
});
