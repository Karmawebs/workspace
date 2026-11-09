import assert from "node:assert/strict";
Deno.test("administrative list returns project labels and usernames only after checking membership",async()=>{
 Deno.env.set("SUPABASE_URL","http://localhost:54321");Deno.env.set("SUPABASE_SERVICE_ROLE_KEY","fixture");
 let handler!:(r:Request)=>Promise<Response>;
 const desc=Object.getOwnPropertyDescriptor(Deno,"serve")!, f=globalThis.fetch;
 Object.defineProperty(Deno,"serve",{configurable:true,value:(h:typeof handler)=>handler=h});
 let role="member",reveals=0;
 globalThis.fetch=async(i,init)=>{const r=new Request(i,init),u=new URL(r.url),table=u.pathname.split("/").pop();const wrap=(row:object)=>Response.json(r.headers.get("accept")?.includes("object")?row:[row]);
 if(table==="user")return Response.json({id:"admin"});
 if(table==="kw_projects")return wrap({workspace_id:"w"});if(table==="kw_workspace_members")return wrap({role});
 if(table==="kw_portal_credential"){assert.deepEqual(await r.json(),{p_project:"p",p_id:"c",p_action:"reveal"});reveals++;return Response.json({username:"Editor",password:"not-in-list",notes:"not-in-list"});}
 assert.equal(u.searchParams.get("project_id"),"eq.p");
 if(table==="kw_portal_history")return Response.json([{actor:"client",event:"changes",kw_content_items:{project_id:"p",title:"Menú"}}]);
 if(table==="kw_portal_access")return Response.json([{user_id:"client",name:"Cliente QA"}]);
 if(table==="kw_portal_credentials")return Response.json([{id:"c",service:"CMS",visible:false}]);
 throw Error("Unexpected request");};
 try{await import("../../functions/social-portal-admin/index.ts");const run=()=>handler(new Request("http://localhost/",{method:"POST",headers:{authorization:"Bearer e30."+btoa(JSON.stringify({session_id:"s"}))+".sig"},body:JSON.stringify({action:"list",projectId:"p"})}));
 assert.equal((await run()).status,403);assert.equal(reveals,0);role="owner";const result=await run();assert.equal(result.status,200);const list=await result.json();assert.equal(list.history[0].title,"Menú");assert.equal(list.history[0].client,"Cliente QA");assert.deepEqual(list.credentials,[{id:"c",service:"CMS",visible:false,username:"Editor"}]);assert(!JSON.stringify(list).includes("not-in-list"));
 }finally{globalThis.fetch=f;Object.defineProperty(Deno,"serve",desc)}
});
