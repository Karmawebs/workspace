import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Technical } from "../src/modules/Care";
import { actionState, agentReady } from "../src/modules/careActions";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), wake: vi.fn(), from: vi.fn(), actions: [] as object[], version: "0.8.0" }));
vi.mock("../src/lib/supabase", () => ({ db: { from: mock.from, rpc: mock.rpc, functions: { invoke: mock.wake } } }));
vi.mock("../src/core/EntityView", () => ({ EntityView: () => null }));
beforeEach(() => {
  mock.actions = []; mock.version = "0.8.0";
  mock.rpc.mockResolvedValue({ data: "job", error: null });
  mock.wake.mockResolvedValue({ data: { ok: true }, error: null });
  mock.from.mockImplementation((name: string) => {
    const rows: Record<string, object[]> = {
      diagnostics: [{ id: "d", wp_version: "6.8", wp_update_available: true, health: [], raw: { site_kit: { services: ["analytics"] } } }],
      installations: [{ id: "i", plugin_version: mock.version, connected_at: "2026-10-25" }],
      plugin_snapshots: [{ id: "plug", name: "Visible name", slug: "actual/plugin.php", version: "1", update_available: true }],
      theme_snapshots: [{ id: "theme", name: "Visible theme", slug: "actual-theme", version: "1", update_available: true }],
      alerts: [], action_jobs: mock.actions,
    };
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain), then: (resolve: (r: object) => unknown) => Promise.resolve({ data: rows[name] || [], error: null }).then(resolve) };
    return chain;
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = () => render(<Technical site={{ id: "bridge", legacy_site_id: "legacy", domain: "test.invalid" }} close={vi.fn()}/>);
it("requires confirmation and sends the real plugin file, then securely wakes the site", async () => {
  show(); const buttons = await screen.findAllByRole("button", { name: "Actualizar" });
  await userEvent.click(buttons[0]); expect(mock.rpc).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog"); expect(dialog.textContent).toContain("¿Actualizar Visible name?");
  await userEvent.click(within(dialog).getByRole("button", { name: "Actualizar" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("enqueue_workspace_care_action", { p_care_site_id: "bridge", p_action_type: "update_plugins", p_target: "actual/plugin.php" }));
  expect(mock.wake).toHaveBeenCalledWith("care-agent", { body: { action: "wake_site", site_id: "legacy" } });
  expect(screen.getByText("Historial técnico")).toBeTruthy();expect(screen.getByText("Google Site Kit")).toBeTruthy();expect(screen.getByText("analytics")).toBeTruthy();
});
it("cancel confirmation never creates a job", async () => {
  show();await userEvent.click(await screen.findByRole("button", { name: "Actualizar WordPress" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  expect(mock.rpc).not.toHaveBeenCalled();expect(mock.wake).not.toHaveBeenCalled();
});
it("uses the theme stylesheet", async () => {
  show();await userEvent.click((await screen.findAllByRole("button", { name: "Actualizar" }))[1]);
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Actualizar" }));
  expect(mock.rpc).toHaveBeenCalledWith("enqueue_workspace_care_action", expect.objectContaining({ p_action_type: "update_themes", p_target: "actual-theme" }));
});
it("does not wake when authorization/enqueue fails", async () => {
  mock.rpc.mockResolvedValue({ error: new Error("No autorizado") });show();
  await userEvent.click(await screen.findByRole("button", { name: "Actualizar WordPress" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Actualizar" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "No autorizado");expect(mock.wake).not.toHaveBeenCalled();
});
it("keeps a saved job when wake fails and prevents another enqueue while active", async () => {
  mock.wake.mockImplementation(async () => { mock.actions = [{ id: "j", status: "pending" }]; return { error: new Error("timeout") }; });show();
  await userEvent.click(await screen.findByRole("button", { name: "Actualizar WordPress" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Actualizar" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Acción guardada");expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it("disables updates for old agents and running jobs", async () => {
  mock.version="0.7.3";mock.actions=[{id:"j",status:"running",progress_stage:"health"}];show();
  expect(await screen.findByRole("button",{name:"Actualizar WordPress"})).toHaveProperty("disabled",true);
  expect(screen.getByText("Comprobando web")).toBeTruthy();
});
it("only labels verified restoration as rollback", () => {
  expect(actionState({id:"j",status:"failed",result:{rolled_back:[{restored:false}]}})).toBe("Error");
  expect(actionState({id:"j",status:"failed",result:{rolled_back:[{restored:true}]}})).toBe("Rollback realizado");
  expect(agentReady("0.10.0")).toBe(true);expect(agentReady("0.7.3")).toBe(false);
});
