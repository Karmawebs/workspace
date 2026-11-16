// In-memory backend for UI verification only. No network or real user data.
export const workspace = 'workspace-test';
export const project = 'karma-test';
export let tables: Record<string, any[]> = {};
export let writes: {table:string; payload:any}[] = [];
export let failNext = false;
export function reset() {
 writes=[]; failNext=false;
 tables={
  kw_workspace_members:[{workspace_id:workspace,user_id:'user-test',role:'owner',kw_workspaces:{name:'Karma'}}],
  kw_apps:['karma','work','social','care'].map(key=>({workspace_id:workspace,key,enabled:true})),
  kw_projects:[{id:project,workspace_id:workspace,app_key:'karma',name:'Karma',metadata:{internal_home:true}}],
  kw_tasks:[{id:'task-1',workspace_id:workspace,project_id:project,app_key:'karma',title:'Preparar propuesta para el nuevo proyecto',description:'Notas conservadas de la tarea',status:'pending',priority:'normal'},
   {id:'task-2',workspace_id:workspace,project_id:project,app_key:'karma',title:'Revisar los documentos',status:'pending'},
   {id:'task-done',workspace_id:workspace,project_id:project,app_key:'karma',title:'Tarea completada',status:'done'}],
  kw_task_attachments:[{id:'file-1',task_id:'task-1',workspace_id:workspace,file_name:'Documento de prueba.pdf',file_url:'https://example.test/document.pdf'}],
  kw_task_checklist_items:[],kw_project_files:[],kw_project_resources:[],kw_internal_contacts:[],kw_app_modules:[],
 };
}
reset();
export const db:any={
 auth:{getSession:async()=>({data:{session:{user:{id:'user-test',email:'qa@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},
 channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:()=>{},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/file'}}),upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'https://example.test/file'}})})},
 from(table:string){
  let mode='read',payload:any,single=false;const filters:((row:any)=>boolean)[]=[];
  const q:any={select:()=>q,eq:(key:string,value:any)=>{filters.push(row=>row[key]===value);return q;},contains:(key:string,value:any)=>{filters.push(row=>Object.keys(value).every(k=>row[key]?.[k]===value[k]));return q;},order:()=>q,limit:()=>q,maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},insert:(value:any)=>{mode='insert';payload=value;return q;},update:(value:any)=>{mode='update';payload=value;return q;},delete:()=>{mode='delete';return q;},then(resolve:any,reject:any){return new Promise(r=>setTimeout(r,20)).then(()=>{
   if(mode!=='read'&&failNext){failNext=false;return {data:null,error:{message:'Fallo de prueba'}};}
   let rows=(tables[table]||[]).filter(row=>filters.every(f=>f(row)));
   if(mode==='insert'){rows=(Array.isArray(payload)?payload:[payload]).map(v=>({id:crypto.randomUUID(),status:'pending',priority:'normal',...v}));tables[table]=[...(tables[table]||[]),...rows];writes.push({table,payload});}
   if(mode==='update'){rows.forEach(row=>Object.assign(row,payload));writes.push({table,payload});}
   if(mode==='delete')tables[table]=(tables[table]||[]).filter(row=>!rows.includes(row));
   return {data:single?rows[0]||null:rows,count:rows.length,error:null};
  }).then(resolve,reject);}};return q;
 }
};
export function failOnce(){failNext=true;}
