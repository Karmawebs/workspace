import type { AppKey } from "../core/model";
export const branch = { key: "work-projects", name: "Trabajo / Proyectos" };
export const apps: Record<AppKey,{name:string;color:string;description:string;panels:{key:string;title:string}[]}> = {
  work:{name:"Work",color:"#b8d5a6",description:"De la idea a la entrega.",panels:[{key:"access",title:"Accesos"},{key:"files",title:"Archivos"},{key:"next_milestone",title:"Próximo hito"},{key:"information",title:"Información"}]},
  social:{name:"Social",color:"#d5bce8",description:"Ideas que se convierten en contenido.",panels:[{key:"access",title:"Accesos"},{key:"references",title:"Referencias visuales"},{key:"next_event",title:"Próximo evento"},{key:"information",title:"Información"}]},
  care:{name:"Care",color:"#a8ceda",description:"Cada proyecto, bien cuidado.",panels:[{key:"access",title:"Accesos"},{key:"hosting",title:"Hosting"},{key:"connections",title:"Conexiones"},{key:"information",title:"Información"}]},
};
export const navigation = [
  {path:"dashboard",name:"Resumen",module:"project_dashboard",apps:["work"]},
  {path:"projects",name:"Proyectos",module:"projects"},
  {path:"tasks",name:"Tareas",module:"tasks",apps:["care"]},
  {path:"events",name:"Reuniones",module:"meetings",apps:["care"]},
  {path:"journal",name:"Diario",module:"journal",apps:["care"]},
  {path:"calendar",name:"Calendario",module:"calendar",apps:["social"]},
  {path:"content",name:"Contenido",module:"content_manager",apps:["social"]},
  {path:"milestones",name:"Hitos",module:"milestones",apps:[]},
  {path:"sites",name:"Área técnica",module:"technical",apps:["care"]},
  {path:"connections",name:"Conexiones",module:"connections",apps:["care"]},
  {path:"clients",name:"CRM · Clientes",module:"crm"},
  {path:"alerts",name:"Alertas",module:"alerts"},
  {path:"users",name:"Equipo",module:"users",apps:["social","care"]},
];
