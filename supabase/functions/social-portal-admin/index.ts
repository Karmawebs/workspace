import {scope,cors,json,Failure} from "../_shared/social-drive.ts";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Método no válido"},405);
 try{
 const b=await req.json();const {db,user,projectId}=await scope(req,b.projectId);
 const email=String(b.email??"").trim().toLowerCase(),name=String(b.name??"").trim();
 const checkName=()=>{if(!/^\S+@\S+\.\S+$/.test(email)||!name||name.length>150)throw new Failure("Revisa el nombre y el correo.",400)};
 const checkPassword=()=>{if(typeof b.password!=="string"||b.password.length<12||b.password.length>128)throw new Failure("Utiliza entre 12 y 128 caracteres.",400)};
 if(b.action==="create"){
 checkName();checkPassword();
 const create=(login:string)=>db.auth.admin.createUser({email:login,password:b.password,email_confirm:true,role:"kw_portal_client",app_metadata:{portal:"social",project:projectId,name,contact:email}});
 let r=await create(email);if(r.error?.code==="email_exists"){r=await create("cliente-"+crypto.randomUUID()+"@portal.invalid");}
 if(r.error)throw new Failure("No se pudo crear el acceso. Comprueba si ya existe en este proyecto.",409);
 return json({login:r.data.user.email});
 }
 if(b.action==="list"){
 const access=await db.from("kw_portal_access").select("user_id,name,contact_email,login_email,active").eq("project_id",projectId).order("name");
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
 if(b.action==="reset"){
 checkPassword();const {data}=await db.auth.admin.getUserById(a.user_id);
 if(data.user?.role!=="kw_portal_client")throw new Failure("Acceso no disponible.",403);
 const result=await db.auth.admin.updateUserById(a.user_id,{password:b.password});if(result.error)throw Error();
 }else if(b.action==="edit")checkName();else if(b.action!=="active"||typeof b.active!=="boolean")throw new Failure("Operación no válida.",400);
 const {error}=await db.from("kw_portal_access").update(b.action==="edit"?{name,contact_email:email}:{valid_after:new Date().toISOString(),...(b.action==="active"?{active:b.active}:{})}).eq("project_id",projectId).eq("user_id",a.user_id);
 if(error)throw error;return json({ok:true});
 }catch(e){return json({error:e instanceof Failure?e.message:"No se pudo completar la operación."},e instanceof Failure?e.status:500);}
});
