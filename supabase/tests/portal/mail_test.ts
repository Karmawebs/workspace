import assert from 'node:assert/strict';
import nodemailer from 'npm:nodemailer@7.0.11';
import {deliver,smtpFailure} from '../../functions/social-client-portal/mail.ts';
Deno.test('SMTP queue: five kinds, claims, preferences, isolation, safe retries and uncertain delivery fence',async()=>{
 for(const [k,v] of Object.entries({SUPABASE_URL:'http://localhost:54321',SUPABASE_SERVICE_ROLE_KEY:'fixture',PORTAL_SMTP_ENABLED:'true',PORTAL_SMTP_PASSWORD:'fixture'}))Deno.env.set(k,v);
 const original=globalThis.fetch,transport=nodemailer.createTransport;
 let attempts=0,failure:unknown=null,preferences=['new','modified','scheduled','published','reply'],active=true,content=true;
 let job:Record<string,any>={};
 const reset=(kind='new')=>job={id:crypto.randomUUID(),ticket:crypto.randomUUID(),created_at:new Date().toISOString(),due_at:new Date(0).toISOString(),kind,tries:0,project_id:'p',user_id:'u',content_id:'c',state:'pending'};
 nodemailer.createTransport=()=>({sendMail:async(mail:Record<string,unknown>)=>{attempts++;assert.equal(mail.to,'test@example.invalid');assert.equal(mail.messageId,`<${job.id}@karmawebs.com>`);assert(String(mail.html).includes('firmakarma.png'));assert(String(mail.html).includes('Manrope'));if(failure)throw failure;return {accepted:[mail.to]}},close(){}});
 globalThis.fetch=async(input,init)=>{
 const r=new Request(input,init),url=new URL(r.url),table=url.pathname.split('/').pop();assert.equal(url.hostname,'localhost');let result:unknown=[];
 if(table==='kw_portal_mail'){
 const states=url.searchParams.get('state');
 const stateMatches=!states||(states.startsWith('in.')?states.slice(4,-1).split(',').includes(job.state):states==='eq.'+job.state);
 const due=url.searchParams.get('due_at');const dueMatches=!due||Date.parse(job.due_at)<=Date.parse(due.slice(4));
 const match=url.searchParams.get('ticket')==='eq.'+job.ticket&&stateMatches&&dueMatches;
 if(match&&r.method==='PATCH'){Object.assign(job,await r.json());result=[{id:job.id}]}
 if(match&&r.method==='GET')result=[job];
 }else if(table==='kw_portal_access'){assert.equal(url.searchParams.get('project_id'),'eq.p');result=[{active,preferences,name:'Test',contact_email:'test@example.invalid'}]}
 else if(table==='kw_content_items'){assert.equal(url.searchParams.get('project_id'),'eq.p');result=content?[{id:'c',title:'Visible title'}]:[]}
 else if(table==='kw_projects')result=[{name:'Project'}];else throw Error('Unexpected table');
 return Response.json(result);
 };
 const run=()=>deliver({id:job.id,ticket:job.ticket});
 try {
 for(const kind of preferences){reset(kind);const old=job.ticket;await Promise.all([run(),run()]);assert.equal(job.state,'sent');assert(job.sent_at);await deliver({id:job.id,ticket:old})}assert.equal(attempts,5);
 reset();preferences=[];await run();assert.equal(job.state,'skipped');assert.equal(attempts,5);
 reset();preferences=['new'];active=false;await run();assert.equal(job.state,'skipped');active=true;
 reset();content=false;await run();assert.equal(job.state,'skipped');content=true;assert.equal(attempts,5);
 reset();Deno.env.set('PORTAL_SMTP_ENABLED','false');await run();assert.equal(job.state,'pending');assert.equal(job.tries,0);Deno.env.set('PORTAL_SMTP_ENABLED','true');
 reset();failure={responseCode:451,command:'DATA'};await run();assert.equal(job.state,'pending');assert.equal(job.tries,1);const before=attempts;await run();assert.equal(attempts,before);job.due_at=new Date(0).toISOString();failure=null;await run();assert.equal(job.state,'sent');
 reset();failure={code:'ETIMEDOUT',command:'DATA'};await run();assert.equal(job.state,'unknown');const uncertain=attempts;job.due_at=new Date(0).toISOString();await run();assert.equal(attempts,uncertain);
 reset();failure={responseCode:550};await run();assert.equal(job.state,'failed');
 reset();job.tries=4;failure={responseCode:421};await run();assert.equal(job.state,'failed');assert.equal(job.tries,5);
 reset();job.created_at=new Date(Date.now()-25*3600000).toISOString();await run();assert.equal(job.state,'skipped');
 }finally{globalThis.fetch=original;nodemailer.createTransport=transport;Deno.env.delete('PORTAL_SMTP_PASSWORD');Deno.env.delete('PORTAL_SMTP_ENABLED')}
});
Deno.test('SMTP ambiguous errors never retry automatically',()=>{
 assert.equal(smtpFailure({code:'ECONNECTION',command:'DATA'}),'unknown');assert.equal(smtpFailure({code:'ETIMEDOUT',command:'CONN'}),'retry');assert.equal(smtpFailure({code:'EDNS'}),'retry');assert.equal(smtpFailure({code:'EAUTH',command:'AUTH'}),'failed');assert.equal(smtpFailure(Error('private provider detail')),'unknown');
});
