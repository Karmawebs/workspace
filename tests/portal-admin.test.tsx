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
async function start(){render(<PortalAdmin projectId="p" workspaceId="w"/>);await screen.findByText(user.login_email)}
it("mantiene los formularios cerrados y permite crear, editar y desactivar desde diálogos",async()=>{
 await start();expect(screen.queryByRole("dialog")).toBeNull();click("Añadir cliente");
 for(const [label,value] of [["Nombre","Prueba"],["Correo de contacto","qa@example.invalid"],["Contraseña inicial","fixture-12345"]])fireEvent.change(screen.getByLabelText(new RegExp(label)),{target:{value}});
 click("Crear acceso");await screen.findByText(/Acceso creado/);expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:expect.objectContaining({action:"create",projectId:"p",name:"Prueba"})});
 click("Gestionar");click("Editar contacto");fireEvent.change(screen.getByLabelText("Nombre"),{target:{value:"Editado"}});click("Guardar cambios");await screen.findByText("Contacto actualizado.");click("Gestionar");click("Desactivar");await screen.findByText("Estado actualizado.");expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:{action:"active",id:"u",projectId:"p",active:false}});
});
it("muestra la solicitud con su contexto y responde vinculada a la actividad original",async()=>{
 await start();expect(screen.getByText("Menú")).toBeTruthy();click("Consultar Cambios solicitados");await screen.findByText(row.comment);fireEvent.change(screen.getByLabelText("Respuesta"),{target:{value:"Corregido"}});click("Responder");await screen.findByText("Respuesta registrada.");expect(invoke).toHaveBeenCalledWith("social-portal-admin",{body:expect.objectContaining({action:"reply",projectId:"p",parent:"h",comment:"Corregido"})});
});
it("consulta una credencial únicamente al abrirla y confirma antes de eliminar",async()=>{
 await start();expect(invoke).toHaveBeenCalledTimes(1);click("Consultar CMS");await waitFor(()=>expect(screen.getByLabelText("Contraseña").getAttribute("type")).toBe("password"));click("Cerrar");expect(screen.queryByDisplayValue("fixture-only")).toBeNull();vi.mocked(window.confirm).mockReturnValue(false);click("Eliminar CMS");expect(invoke).toHaveBeenCalledTimes(2);
});
