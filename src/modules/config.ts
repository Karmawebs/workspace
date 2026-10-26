import type { AppKey } from "../core/model";
export const branch = { key: "work-projects", name: "Trabajo / Proyectos" };
export const apps: Record<AppKey,{name:string;color:string;description:string;panels:{key:string;title:string}[]}> = {
  work:{name:"Work",color:"#b8d5a6",description:"De la idea a la entrega.",panels:[{key:"access",title:"Accesos"},{key:"files",title:"Archivos"},{key:"next_milestone",title:"Próximo hito"},{key:"information",title:"Información"}]},
  social:{name:"Social",color:"#d5bce8",description:"Ideas que se convierten en contenido.",panels:[{key:"access",title:"Accesos"},{key:"references",title:"Referencias visuales"},{key:"next_event",title:"Próximo evento"},{key:"information",title:"Información"}]},
  care:{name:"Care",color:"#a8ceda",description:"Cada proyecto, bien cuidado.",panels:[{key:"hosting",title:"Mantenimiento"},{key:"connections",title:"Conexión"},{key:"information",title:"Información"},{key:"access",title:"Accesos"}]},
};
export const navigation = [
  {path:"dashboard",name:"Resumen",module:"project_dashboard",apps:["work"]},
  {path:"projects",name:"Proyectos",module:"projects"},
  {path:"calendar",name:"Calendario",module:"calendar",apps:["social"]},
  {path:"content",name:"Contenido",module:"content_manager",apps:["social"]},
  {path:"milestones",name:"Hitos",module:"milestones",apps:[]},
  {path:"sites",name:"Área técnica",module:"technical",apps:["care"]},
  {path:"connections",name:"Conexiones",module:"connections",apps:["care"]},
  {path:"clients",name:"CRM · Clientes",module:"crm",apps:["work","social"]},
  {path:"alerts",name:"Alertas",module:"alerts",apps:["care"]},
  {path:"settings",name:"Configuración",module:"settings",apps:["care"]},
  {path:"users",name:"Equipo",module:"users",apps:["social"]},
];
