import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {it,expect,vi,beforeEach} from "vitest";
const invoke=vi.hoisted(()=>vi.fn());
vi.mock("../src/lib/supabase",()=>({db:{functions:{invoke}}}));
import {PortalAdmin} from "../src/portal/PortalAdmin";
const user={user_id:"u",name:"Cliente QA",login_email:"login@example.invalid",contact_email:"contact@example.invalid",active:true};
const row={id:"h",title:"Menú",event:"changes",comment:"Cambiar la foto",client:"Cliente QA",created_at:"2026-11-10T10:00:00Z"};
const credential={id:"c",service:"CMS",username:"Editor QA",visible:false};
const button=(name:string)=>screen.getByRole("button",{name,exact:true});
const click=(s:string)=>fireEvent.click(button(s));
beforeEach(()=>{invoke.mockReset();invoke.mockImplementation(async(_name,{body})=>({data:body.action==="list"?{access:[user],history:[row],credentials:[credential]}:body.op==="reveal"?{value:{username:"Editor QA",password:"fixture-only"}}:{login:body.action==="create"?"login@example.invalid":undefined}}));vi.spyOn(window,"confirm").mockReturnValue(true)});
async function start(){render(<PortalAdmin projectId="p" workspaceId="w"/>);await screen.findByText(user.contact_email)}
it("mantiene los formularios cerrados y permite crear, editar y desactivar desde diálogos",async()=>{
 await start();expect(screen.queryByRole("dialog")).toBeNull();click("Nuevo usuario");
 for(const [label,value] of [["Nombre","Prueba"],["Correo de contacto","qa@example.invalid"]])fireEvent.change(screen.getByLabelText(new RegExp(label)),{target:{value}});
 click("Crear acceso");await screen.findByText(/Acceso creado/);expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:expect.objectContaining({action:"create",projectId:"p",name:"Prueba"})});
 click("Gestionar");click("Editar contacto");fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Editado"}});click("Guardar cambios");await screen.findByText("Contacto actualizado.");click("Gestionar");click("Desactivar");await screen.findByText("Estado actualizado.");expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:{action:"active",id:"u",projectId:"p",active:false}});
});
it("muestra la solicitud con su contexto y responde vinculada a la actividad original",async()=>{
 await start();expect(screen.getByText("Menú")).toBeTruthy();click("Consultar Cambios solicitados");await screen.findByText(row.comment);fireEvent.change(screen.getByLabelText("Respuesta"),{target:{value:"Corregido"}});click("Responder");await screen.findByText("Respuesta registrada.");expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:expect.objectContaining({action:"reply",projectId:"p",parent:"h",comment:"Corregido"})});
});
it("consulta una credencial únicamente al abrirla y confirma antes de eliminar",async()=>{
 await start();expect(invoke).toHaveBeenCalledTimes(1);click("Consultar CMS");await waitFor(()=>expect(screen.getByLabelText("Contraseña").getAttribute("type")).toBe("password"));click("Cerrar");expect(screen.queryByDisplayValue("fixture-only")).toBeNull();vi.mocked(window.confirm).mockReturnValue(false);click("Eliminar CMS");expect(invoke).toHaveBeenCalledTimes(2);
});
it("conserva la actividad plegada y mueve los usuarios al acceso del proyecto",async()=>{
 render(<PortalAdmin projectId="p" workspaceId="w"><h2>Contenido habitual</h2></PortalAdmin>);
 await waitFor(()=>expect(invoke).toHaveBeenCalledTimes(1));
 expect(screen.queryByRole("heading",{name:"Accesos de clientes"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/Avisos y aprobaciones/}));
 await screen.findByText("Menú");
});
it("limita Usuarios al proyecto e informa de SMTP pendiente sin pedir contraseña",async()=>{
 invoke.mockImplementation(async(_name,{body})=>({data:body.action==="list"?{access:[user],history:[],credentials:[]}:{login:"alias@portal.invalid",delivery:"unconfigured"}}));
 render(<PortalAdmin projectId="p" workspaceId="w" usersOnly/>);
 await screen.findByText(user.contact_email);expect(screen.queryByRole("combobox")).toBeNull();expect(screen.queryByRole("heading",{name:"Credenciales"})).toBeNull();
 click("Nuevo usuario");expect(screen.queryByLabelText("Contraseña inicial")).toBeNull();
 fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Prueba"}});
 fireEvent.change(screen.getByLabelText("Correo de contacto"),{target:{value:"qa@example.invalid"}});
 click("Crear acceso");await screen.findByText(/[Cc]orreo pendiente de configurar SMTP/);
 const call=invoke.mock.calls.find(([,b])=>b.body.action==="create")![1].body;
 expect(call.projectId).toBe("p");expect(call.request).toMatch(/^[a-f0-9-]{36}$/);expect(call.password).toBeUndefined();
 click("Gestionar");click("Reenviar invitación");await waitFor(()=>expect(invoke.mock.calls.some(([,b])=>b.body.action==="invite"&&b.body.id==="u")).toBe(true));
});
