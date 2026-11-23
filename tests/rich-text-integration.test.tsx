import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../src/lib/supabase", async () => ({
  db: (await import("./fixtures/karmaBackend")).db,
}));
import {
  reset,
  tables,
  writes,
  workspace,
  project,
} from "./fixtures/karmaBackend";
import { Editor } from "../src/core/Editor";
import { entity } from "../src/core/entities";
import { contentHtml, plainText } from "../src/components/rich-text/content";
const scope = {
  workspaceId: workspace,
  app: "karma" as const,
  userId: "user-test",
};
beforeEach(reset);
it("persists formatted task content through the existing save path and keeps attachments", async () => {
  const saved = vi.fn();
  render(
    <Editor
      def={entity("tasks")}
      scope={scope}
      projectId={project}
      original={tables.kw_tasks[0]}
      onClose={() => {}}
      onSave={saved}
    />,
  );
  const box = await screen.findByRole("textbox", { name: "Descripción" });
  await screen.findByRole("link", { name: "Documento de prueba.pdf" });
  box.innerHTML =
    '<p><strong>Instrucciones</strong> <a href="https://example.com">Roles</a></p>';
  fireEvent.input(box);
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>('input[name="description"]')!
        .value,
    ).toContain("karma-rich-text:v1"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const payload = writes.find((w) => w.table === "kw_tasks")!.payload;
  expect(plainText(payload.description)).toBe("Instrucciones Roles");
  expect(contentHtml(payload.description)).toContain(
    "<strong>Instrucciones</strong>",
  );
  expect(contentHtml(payload.description)).toContain(
    'href="https://example.com/"',
  );
  expect(payload).toMatchObject({
    workspace_id: workspace,
    app_key: "karma",
    project_id: project,
    status: "pending",
  });
  expect(tables.kw_task_attachments).toHaveLength(1);
});
