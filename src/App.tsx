import { useEffect, useState, type CSSProperties } from "react";
import { HashRouter, Navigate, useNavigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./core/Editor";
import { entities } from "./core/entities";
import { Auth, ResetPassword, useAuth } from "./core/Auth";
import { apps, navigation } from "./modules/config";
import { type AppKey } from "./core/model";
import { type EntityKey } from "./core/entities";
import { EntityView } from "./core/EntityView";
import { ProjectDetail } from "./core/ProjectDetail";
import { Calendar } from "./modules/Calendar";
import { Dashboard } from "./modules/Dashboard";
import { Care } from "./modules/Care";
import { CareProjectRoute } from "./modules/CareProject";
import { CareProjectEditor } from "./modules/CareProjectEditor";
import { CareSettings } from "./modules/CareSettings";
import { Users } from "./core/Users";
import { db } from "./lib/supabase";

export default function App() { return <HashRouter><Routes><Route path="/reset-password" element={<ResetPassword/>}/><Route path="/*" element={<Auth><Routes><Route path="/:app/*" element={<Shell/>}/><Route path="*" element={<Navigate to="/work/dashboard" replace/>}/></Routes></Auth>}/></Routes></HashRouter>; }

function Shell() {
  const navigate=useNavigate(), [creating,setCreating]=useState(false);
  const {app="work"}=useParams(), {membership,memberships,select,session,signOut}=useAuth(), location=useLocation(), [open,setOpen]=useState(false), [config,setConfig]=useState<{apps:string[];disabled:string[]}>(), [error,setError]=useState("");
  const valid=app in apps, key=(valid?app:"work") as AppKey;
  useEffect(()=>setOpen(false),[location.pathname]);
  useEffect(()=>{let alive=true;setConfig(undefined);setError("");Promise.all([db.from("kw_apps").select("key,enabled").eq("workspace_id",membership.workspace_id),db.from("kw_app_modules").select("app_key,module_key,enabled").eq("workspace_id",membership.workspace_id)]).then(([a,b])=>{if(!alive)return;if(a.error||b.error)setError(a.error?.message||b.error?.message||"Error");else setConfig({apps:(a.data||[]).filter(r=>r.enabled).map(r=>r.key),disabled:(b.data||[]).filter(r=>!r.enabled).map(r=>`${r.app_key}/${r.module_key}`)});});return()=>{alive=false;};},[membership.workspace_id]);
  if(!valid)return <Navigate to="/work/dashboard" replace/>;
  const scope={workspaceId:membership.workspace_id,app:key,userId:session.user.id};
  const available=navigation.filter(n=>(!n.apps||n.apps.includes(key))&&!config?.disabled.includes(`${key}/${n.module}`)), allowed=config?.apps.includes(key);
  return <div className="shell" style={{"--accent":apps[key].color} as CSSProperties}>
    <Sidebar app={key} enabledApps={(Object.keys(apps) as AppKey[]).filter(a=>!config||config.apps.includes(a))} items={available} email={session.user.email} role={membership.role} open={open} canCreate={!!allowed&&available.some(n=>n.path==="projects")} onClose={()=>setOpen(false)} onCreate={()=>{setOpen(false);setCreating(true);}} onSignOut={signOut}/>
    {creating && (key==="care" ? <CareProjectEditor scope={scope} onClose={()=>setCreating(false)} onSave={(row)=>{setCreating(false);navigate(`/care/projects/${row.id}`);}}/> : <Editor key={membership.workspace_id} def={entities.projects} scope={scope} onClose={()=>setCreating(false)} onSave={(row)=>{setCreating(false);navigate(`/${key}/projects/${row.id}`);}}/>)}
    <div className="main-shell">
      <header className={`topbar mobile-only-topbar${memberships.length>1?" has-workspaces":""}`}><button className="icon-button mobile-menu" aria-label="Abrir navegación" aria-expanded={open} aria-controls="workspace-navigation" onClick={()=>setOpen(!open)}><Menu/></button>{memberships.length>1?<select aria-label="Workspace" value={membership.workspace_id} onChange={e=>select(e.target.value)}>{memberships.map(m=><option value={m.workspace_id} key={m.workspace_id}>{m.name}</option>)}</select>:<span className="workspace-name"><i/>{membership.name}</span>}</header>
      <main key={`${membership.workspace_id}/${key}`}>{error?<p className="error" role="alert">{error}<button onClick={()=>window.location.reload()}>Reintentar</button></p>:!config?<p role="status">Cargando Workspace…</p>:!allowed?<div className="card info-panel"><h1>Aplicación no habilitada</h1><p>Selecciona una aplicación disponible en el menú.</p></div>:<Routes>
        <Route index element={<Navigate to={key==="work"?"dashboard":"projects"} replace/>}/>
        {available.map(n=><Route key={n.path} path={n.path} element={n.path==="dashboard"?<Dashboard scope={scope}/>:n.path==="calendar"?<Calendar scope={scope}/>:n.path==="sites"?<Care scope={scope}/>:n.path==="settings"&&key==="care"?<CareSettings scope={scope}/>:n.path==="users"?<Users/>:<EntityView kind={n.path as EntityKey} scope={scope}/>}/>) }
        {available.some(n=>n.path==="projects")&&<Route path="projects/:id" element={key==="care"?<CareProjectRoute scope={scope}/>:<ProjectDetail scope={scope}/>}/>} 
        <Route path="*" element={<div className="card info-panel"><h1>Página no disponible</h1><p>Selecciona una sección del menú.</p></div>}/>
      </Routes>}</main>
      <footer className="app-footer">KARMA WORKSPACE <span>Work · Social · Care</span></footer>
    </div>
  </div>;
}
