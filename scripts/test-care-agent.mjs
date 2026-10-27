import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source=fs.readFileSync(new URL('../supabase/functions/care-agent/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
let handler, mode='owner', calls=[], fetches=[];
const client={auth:{getUser:async(jwt)=>({data:{user:jwt==='valid'?{id:'user'}:null},error:jwt!=='valid'})},rpc:async(name,args)=>{calls.push({name,args});return {data: name==='agent_next_action'?[]:true,error:null};},from:(table)=>{
 const chain={select(){return chain},eq(){return chain},limit(){return chain},maybeSingle(){return chain},then(resolve){
 let data=table==='kw_care_sites'?{workspace_id:'ws',project_id:'p'}:table==='kw_projects'?(mode==='wrong-project'?null:{id:'p'}):table==='kw_workspace_members'?(mode==='outsider'?null:{user_id:'user'}):table==='action_jobs'?(mode==='idle'?[]:[{id:'job'}]):{api_token:'fixture-only',sites:{domain:mode==='private'?'127.0.0.1':'fixture.example'}};
 return Promise.resolve({data,error:null}).then(resolve);
 }};return chain;
}};
vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{serve(fn){handler=fn},env:{get(){return 'test'}},resolveDns:async()=>['203.0.113.20']},createClient:()=>client,Response,Request,URL,AbortController,setTimeout,clearTimeout,fetch:async(url,args)=>{fetches.push({url:String(url),args});return new Response('{"ok":true}',{status:200})}});
const request=(body,jwt)=>handler(new Request('https://edge.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(jwt?{Authorization:`Bearer ${jwt}`}:{})},body:JSON.stringify(body)}));
assert.equal((await request({action:'wake_site',site_id:'site'})).status,401);
assert.equal((await request({action:'wake_site',site_id:'site'},'invalid')).status,401);
mode='outsider';assert.equal((await request({action:'wake_site',site_id:'site'},'valid')).status,403);assert.equal(fetches.length,0);
mode='wrong-project';assert.equal((await request({action:'wake_site',site_id:'site'},'valid')).status,403);
mode='idle';assert.equal((await request({action:'wake_site',site_id:'site'},'valid')).status,200);assert.equal(fetches.length,0);
mode='owner';assert.equal((await request({action:'wake_site',site_id:'site'},'valid')).status,200);assert.equal(fetches.length,1);assert.equal(fetches[0].args.redirect,'error');assert.equal(fetches[0].args.headers['X-Karma-Care-Token'],'fixture-only');
for(const action of ['diagnostic','next_action','start_action','progress_action','finish_action'])assert.equal((await request({action,token:'fixture-only',action_id:'job'})).status,200);
assert.deepEqual(calls.map(c=>c.name),['ingest_diagnostic','agent_next_action','agent_start_action','agent_progress_action','agent_finish_action']);
console.log('PASS: wake requires verified user, workspace membership and Care project; idle sites are not contacted; redirects disabled; plugin transport preserved.');
