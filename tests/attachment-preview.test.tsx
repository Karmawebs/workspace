import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/lib/supabase", async () => ({ db: (await import("./fixtures/karmaBackend")).db }));
import { reset, tables, writes, workspace, project, db } from "./fixtures/karmaBackend";
import { Editor } from "../src/core/Editor";
import { entity } from "../src/core/entities";

const objectUrl = vi.fn(() => "blob:workspace-preview");
const revoke = vi.fn();
beforeEach(() => {
  reset();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["pdf"], { type: "application/pdf" }) })));
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: objectUrl, revokeObjectURL: revoke }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(app: "work" | "care" | "social" | "karma") {
  const save = vi.fn(), close = vi.fn();
  render(<Editor def={entity("tasks")} scope={{ app, workspaceId:workspace, userId:"user-test" }} projectId={project} original={tables.kw_tasks[0]} onSave={save} onClose={close}/>);
  return { save, close };
}

describe("shared task attachment viewer", () => {
  it.each(["work", "social", "care", "karma"] as const)("opens saved PDF and closes without saving or closing %s task", async (app) => {
    const {save, close}=mount(app);
    fireEvent.click(await screen.findByRole("button", {name:"Documento de prueba.pdf"}));
    const preview=await screen.findByRole("dialog", {name:"Vista previa de Documento de prueba.pdf"});
    await waitFor(()=>expect(within(preview).getByTitle("Vista previa del PDF").getAttribute("src")).toBe("blob:workspace-preview"));
    expect((within(preview).getByRole("button", {name:"Descargar archivo"}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(preview).getByRole("button", {name:"Cerrar vista previa"}));
    expect(screen.queryByRole("dialog",{name:"Vista previa de Documento de prueba.pdf"})).toBeNull();
    expect(screen.getByRole("textbox",{name:"Título *"})).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith("blob:workspace-preview");
  });

  it("downloads saved storage files via the authenticated path with the original filename", async () => {
    tables.kw_task_attachments[0].storage_path="workspace-test/task-1/id-documento.pdf";
    const download=vi.fn(async()=>({data:new Blob(["pdf"]),error:null}));
    vi.spyOn(db.storage,"from").mockReturnValue({download});
    const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(function(this:HTMLAnchorElement){
      expect(this.download).toBe("Documento de prueba.pdf");
      expect(this.href).toBe("blob:workspace-preview");
    });
    mount("work");
    fireEvent.click(await screen.findByRole("button", {name:"Documento de prueba.pdf"}));
    const button=screen.getByRole("button",{name:"Descargar archivo"}) as HTMLButtonElement;
    await waitFor(()=>expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(download).toHaveBeenCalledWith("workspace-test/task-1/id-documento.pdf", {}, {signal:expect.any(AbortSignal)});
    expect(fetch).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();
  });

  it("previews a new local PNG before saving and keeps it attached when the viewer closes", async () => {
    const {save}=mount("care");
    fireEvent.change(document.querySelector('input[type="file"]')!, {target:{files:[new File(["png"],"imagen.PNG",{type:"image/png"})]}});
    fireEvent.click(screen.getByRole("button",{name:"imagen.PNG"}));
    expect(await screen.findByRole("img",{name:"imagen.PNG"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Cerrar vista previa"}));
    expect(screen.getByRole("button",{name:"imagen.PNG"})).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("shows an error and permits closing if the file cannot be accessed", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Forbidden"));
    mount("karma");
    fireEvent.click(await screen.findByRole("button",{name:"Documento de prueba.pdf"}));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button",{name:"Descargar archivo"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Cerrar vista previa"}));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
