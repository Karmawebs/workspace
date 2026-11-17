import assert from "node:assert/strict";
import {notification,smtpConfigured,sendNotification} from "../../functions/_shared/portal-notifications.ts";
import {generatedPassword,requestId,invite} from "../../functions/social-portal-admin/invitations.ts";
import {admin} from "../../functions/_shared/social-drive.ts";
Deno.test("notification HTML escapes contact/project; password generation and URL validation",()=>{
 const content=notification("welcome","<script>","A & B",undefined,"alias@portal.invalid");
 assert(!content.html.includes("<script>"));assert(content.html.includes("A &amp; B"));assert(content.html.includes("Acceder a mi espacio"));assert(content.text.includes("alias@portal.invalid"));
 assert.throws(()=>notification("welcome","A","B","https://evil.invalid/portal"));
 const passwords=Array.from({length:100},generatedPassword);assert.equal(new Set(passwords).size,100);assert(passwords.every(p=>p.length>=32));assert.throws(()=>requestId("bad"));
});
Deno.test("missing SMTP is visible, no token generated or delivery attempted, duplicate claims do not send",async()=>{
 Deno.env.set("SUPABASE_URL","http://localhost:54321");Deno.env.set("SUPABASE_SERVICE_ROLE_KEY","fixture");Deno.env.delete("PORTAL_SMTP_PASSWORD");Deno.env.delete("PORTAL_SMTP_ENABLED");
 assert(!smtpConfigured());await assert.rejects(sendNotification("test@example.invalid",notification("welcome","Test","Project"),crypto.randomUUID()));
 const f=globalThis.fetch;let claimed=true,state="sending",writes=0;
 globalThis.fetch=async(i,init)=>{const r=new Request(i,init),u=new URL(r.url),table=u.pathname.split("/").pop();
 if(table==="kw_portal_claim_invitation")return Response.json(claimed);
 assert.equal(table,"kw_portal_access");assert.equal(u.searchParams.get("project_id"),"eq.p");
 if(r.method==="PATCH"){writes++;state=(await r.json()).invitation_state;return new Response(null,{status:204})}
 return Response.json({active:true,name:"Test",contact_email:"test@example.invalid",login_email:"alias@portal.invalid",invitation_state:state});};
 try {const db=admin(),request=crypto.randomUUID();assert.deepEqual(await invite(db,"p","u",request),{delivery:"unconfigured"});assert.equal(writes,1);claimed=false;assert.equal((await invite(db,"p","u",request)).delivery,"unconfigured");assert.equal(writes,1)}finally{globalThis.fetch=f}
});

Deno.test("SMTP uses TLS 465, correct sender/reply-to and stable message ID (mock transport)",async()=>{
 const {default:nodemailer}=await import("npm:nodemailer@7.0.11");
 const original=nodemailer.createTransport;let sent=false,closed=false;
 Deno.env.set("PORTAL_SMTP_PASSWORD","fixture-not-a-secret");Deno.env.set("PORTAL_SMTP_ENABLED","true");
 nodemailer.createTransport=(options:Record<string,unknown>)=>{
 assert.equal(options.host,"mail.karmawebs.com");assert.equal(options.port,465);assert.equal(options.secure,true);assert.equal((options.tls as {rejectUnauthorized:boolean}).rejectUnauthorized,true);
 return {sendMail:(mail:Record<string,unknown>)=>{assert.equal(mail.from,"Karma Social <notificaciones@karmawebs.com>");assert.equal(mail.replyTo,"info@karmawebs.com");assert.equal(mail.messageId,"<request@karmawebs.com>");assert(!JSON.stringify(mail).includes("fixture-not-a-secret"));sent=true;return Promise.resolve({accepted:[mail.to]})},close:()=>{closed=true}};
 };
 try{await sendNotification("test@example.invalid",notification("welcome","Test","Project"),"request");assert(sent&&closed)}finally{nodemailer.createTransport=original;Deno.env.delete("PORTAL_SMTP_PASSWORD");Deno.env.delete("PORTAL_SMTP_ENABLED")}
});
