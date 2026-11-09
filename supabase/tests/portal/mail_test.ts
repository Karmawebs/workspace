import {deliver} from "../../functions/social-client-portal/mail.ts";
Deno.test("mail: simulated provider, repeated delivery, preferences, disabled transport and retry",async()=>{
 for(const [k,v] of Object.entries({SUPABASE_URL:"http://localhost:54321",SUPABASE_SERVICE_ROLE_KEY:"fixture",PORTAL_MAIL_ENABLED:"true",PORTAL_MAIL_FROM:"test@example.invalid",RESEND_API_KEY:"fixture"}))Deno.env.set(k,v);
 const original=globalThis.fetch;
 let attempts=0,status=200,preferences=["new"];
 const job={id:crypto.randomUUID(),ticket:crypto.randomUUID(),created_at:new Date().toISOString(),kind:"new",tries:0,project_id:"p",user_id:"u",content_id:"c",state:"pending"};
 globalThis.fetch=async(input,init)=>{
 const r=new Request(input,init),url=new URL(r.url);
 if(url.hostname==="api.resend.com"){
 attempts++;if(r.headers.get("Idempotency-Key")!==job.id||(await r.json()).to[0]!=="test@example.invalid")throw Error("Wrong delivery");
 return Response.json({},{status});}
 if(url.hostname!=="localhost")throw Error("Unexpected network request");
 const table=url.pathname.split("/").pop();
 let result:unknown=null;
 if(table==="kw_portal_mail"){
 const match=url.searchParams.get("ticket")==="eq."+job.ticket;
 if(match&&r.method==="PATCH"){Object.assign(job,await r.json());result=[{id:job.id}];}
 if(match&&r.method==="GET"&&["pending","sending"].includes(job.state))result=[job];
 }else if(table==="kw_portal_access")result=[{active:true,preferences,contact_email:"test@example.invalid"}];
 else if(table==="kw_content_items")result=[{id:"c"}];else throw Error("Unexpected table");
 return Response.json(result??[]);
 };
 const run=()=>deliver({id:job.id,ticket:job.ticket});
 function check(condition:boolean){if(!condition)throw Error("Unexpected mail state: "+job.state+" attempts "+attempts)}
 try{const ticket=job.ticket;await run();check(job.state==="sent"&&attempts===1);
 await deliver({id:job.id,ticket});check(attempts===1);
 job.state="pending";preferences=[];await run();check(job.state==="skipped"&&attempts===1);
 job.state="pending";preferences=["new"];status=503;await run();check(job.state==="sending"&&attempts===2);
 status=200;await run();check(job.state==="sent"&&attempts===3);
 Deno.env.set("PORTAL_MAIL_ENABLED","false");job.state="pending";await run();check(job.state==="skipped"&&attempts===3);
 }finally{globalThis.fetch=original}
});
