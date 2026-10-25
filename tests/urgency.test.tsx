import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectUrgency } from "../src/core/ProjectUrgency";
const save = vi.hoisted(() => vi.fn());
vi.mock("../src/core/data", () => ({ saveRow: save, message: (e: Error) => e.message }));
afterEach(() => { cleanup(); save.mockReset(); });
it.each(["work", "social", "care"] as const)("persists urgency through shared project save in %s", async (app) => {
  const project = { id: "project-1", priority: "normal", updated_at: "version-1" };
  const scope = { app, workspaceId: "workspace-1", userId: "user-1" };
  const updated = { ...project, priority: "high", updated_at: "version-2" };
  save.mockResolvedValue(updated);
  const onSave = vi.fn();
  render(<ProjectUrgency scope={scope} project={project} onSave={onSave}/>);
  expect(screen.getByRole("button", { name: "Urgencia media" }).getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Urgencia alta" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(updated));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ table: "kw_projects" }), scope, { priority: "high" }, project);
});
it("preserves the selected level and exposes a failed save", async () => {
  save.mockRejectedValue(new Error("Sin permiso"));
  render(<ProjectUrgency scope={{ app: "care", workspaceId: "w", userId: "u" }} project={{ id: "p", priority: "urgent" }} onSave={vi.fn()}/>);
  await userEvent.click(screen.getByRole("button", { name: "Urgencia baja" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Sin permiso");
  expect(screen.getByRole("button", { name: "Urgencia alta" }).getAttribute("aria-pressed")).toBe("true");
});
