import {admin,json} from "../_shared/social-drive.ts";
const kinds:Record<string,string>={new:"Hay contenido nuevo",modified:"Se ha actualizado un contenido",scheduled:"Se ha programado un contenido",published:"Se ha publicado un contenido",reply:"Tienes una respuesta a tu solicitud"};
export async function deliver(b:{id:string,ticket:string}){
 const db=admin();
 const {data:j}=await db.from("kw_portal_mail").select("*").eq("id",b.id).eq("ticket",b.ticket).in("state",["pending","sending"]).lte("due_at",new Date().toISOString()).maybeSingle();
 if(!j)return json({ok:false},403);
 const ticket=crypto.randomUUID(),now=Date.now();
 const {data:claim}=await db.from("kw_portal_mail").update({ticket,state:"sending",due_at:new Date(now+300000).toISOString()}).eq("id",j.id).eq("ticket",b.ticket).select("id").maybeSingle();
 if(!claim)return json({ok:true});
 const finish=(state:string)=>db.from("kw_portal_mail").update({state}).eq("id",j.id).eq("ticket",ticket);
 const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("PORTAL_MAIL_FROM");
 if(!key||!from||Deno.env.get("PORTAL_MAIL_ENABLED")!=="true"||now-Date.parse(j.created_at)>23*3600000){await finish("skipped");return json({ok:true});}
 const {data:a,error}=await db.from("kw_portal_access").select("active,preferences,contact_email").eq("user_id",j.user_id).eq("project_id",j.project_id).maybeSingle();
 const {data:c,error:ce}=await db.from("kw_content_items").select("id").eq("id",j.content_id).eq("project_id",j.project_id).maybeSingle();
 if(error||ce)return json({ok:false},503);
 if(!a?.active||!a.preferences.includes(j.kind)||!c||!kinds[j.kind]){await finish("skipped");return json({ok:true})}
 const {error:write}=await db.from("kw_portal_mail").update({tries:j.tries+1,first_attempt_at:j.first_attempt_at||new Date(now).toISOString()}).eq("id",j.id).eq("ticket",ticket);
 if(write)return json({ok:false},503);
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":j.id},body:JSON.stringify({from,to:[a.contact_email],subject:kinds[j.kind]+" · Karma Social",text:kinds[j.kind]+". Abre tu portal: https://workspace.karmawebs.com/portal"}),signal:AbortSignal.timeout(15000)});
 if(r.ok)await finish("sent");else if(j.tries>=4||(r.status<500&&![429,408].includes(r.status)))await finish("failed");
 return json({ok:r.ok});
}
