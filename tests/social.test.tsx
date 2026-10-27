import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  writes: [] as Record<string, unknown>[],
  filters: [] as [string, unknown][],
  content: [] as Record<string, unknown>[],
  conflict: false,
}));
vi.mock("../src/lib/supabase", () => ({
  db: {
    from(table: string) {
      let payload: Record<string, unknown> | undefined;
      let single = false;
      let from = 0,
        to = 999;
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        order: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          mock.filters.push([key, value]);
          return query;
        },
        gte: () => query,
        lt: () => query,
        range: (start: number, end: number) => {
          from = start;
          to = end;
          return query;
        },
        insert: (value: Record<string, unknown>) => {
          payload = value;
          return query;
        },
        update: (value: Record<string, unknown>) => {
          payload = value;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          if (payload) mock.writes.push(payload);
          const data =
            table === "kw_projects"
              ? [
                  { id: "p1", name: "Cliente Uno" },
                  { id: "p2", name: "Cliente Dos" },
                ]
              : mock.content
                  .filter((row) =>
                    filters.every(([key, value]) => row[key] === value),
                  )
                  .slice(from, to + 1);
          return Promise.resolve(
            resolve({
              data: single ? { id: "saved", ...payload } : data,
              error:
                mock.conflict && single
                  ? { code: "PGRST116", message: "Conflict" }
                  : null,
            }),
          );
        },
      };
      return query;
    },
  },
}));
import {
  drivePreview,
  fileUrls,
  itemsForDay,
} from "../src/modules/socialContent";
import { SocialContentDot } from "../src/modules/SocialContentDot";
import { Editor } from "../src/core/Editor";
import { entities } from "../src/core/entities";
import { Calendar } from "../src/modules/Calendar";
const scope = { app: "social" as const, workspaceId: "w", userId: "u" };
beforeEach(() => {
  mock.writes = [];
  mock.filters = [];
  mock.content = [];
  mock.conflict = false;
});
describe("URLs externas de Social", () => {
  it.each([
    "https://drive.google.com/file/d/abc_123/view?usp=sharing",
    "https://drive.google.com/file/d/abc_123/preview",
    "https://drive.google.com/open?id=abc_123",
    "https://drive.google.com/uc?export=download&id=abc_123",
    "https://drive.google.com/thumbnail?id=abc_123&sz=w100",
    "https://drive.google.com/d/abc_123/view",
  ])("convierte %s", (value) =>
    expect(drivePreview(value)).toBe(
      "https://drive.google.com/thumbnail?id=abc_123&sz=w600",
    ),
  );
  it("conserva resourcekey y rechaza carpetas, protocolos y credenciales", () => {
    expect(
      drivePreview(
        "https://drive.google.com/file/d/abc/view?resourcekey=0-xyz",
      ),
    ).toContain("resourcekey=0-xyz");
    for (const value of [
      "javascript:alert(1)",
      "https://user:pass@example.com/a.jpg",
      "https://drive.google.com/drive/folders/abc",
      null,
      {},
    ])
      expect(drivePreview(value)).toBeUndefined();
    expect(
      drivePreview("https://drive.google.com.evil.test/file/d/abc/view"),
    ).toBe("https://drive.google.com.evil.test/file/d/abc/view");
    expect(fileUrls(["https://a.test", {}, null, "https://b.test"])).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });
});
it("muestra solo círculos; popup en portal, primera imagen, fallback y edición", () => {
  const edit = vi.fn();
  const { container } = render(
    <div style={{ overflow: "hidden" }}>
      <SocialContentDot
        row={{
          id: "a",
          title: "Publicación",
          content_type: "reel",
          file_urls: ["https://a.test/first.jpg", "https://a.test/second.jpg"],
        }}
        onEdit={edit}
      />
    </div>,
  );
  const dot = screen.getByRole("button", { name: "Reel: Publicación" });
  expect(dot.textContent).toBe("");
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.mouseEnter(dot);
  const popup = screen.getByRole("tooltip");
  expect(container.contains(popup)).toBe(false);
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "https://a.test/first.jpg",
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText("Sin vista previa")).toBeTruthy();
  expect(screen.getByText("Publicación")).toBeTruthy();
  fireEvent.keyDown(dot, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(dot);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.click(dot);
  expect(edit).toHaveBeenCalledOnce();
  expect(screen.queryByRole("tooltip")).toBeNull();
});
it("no utiliza el segundo archivo si la portada no es válida", () => {
  render(
    <SocialContentDot
      row={{
        id: "a",
        title: "Sin imagen",
        file_urls: [null, "https://a.test/second.jpg"],
      }}
      onEdit={() => {}}
    />,
  );
  fireEvent.focus(screen.getByRole("button"));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("Sin vista previa")).toBeTruthy();
});
it("unifica el editor, conserva estado/proyecto antiguos y guarda URLs en orden sin borrar canal/responsable", async () => {
  const user = userEvent.setup(),
    save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      original={{
        id: "a",
        title: "Existente",
        project_id: "p2",
        status: "idea",
        content_type: "carousel",
        updated_at: "2026-10-01",
        channel: "instagram",
        assignee_id: "u",
        file_urls: ["https://a.test/1", "https://a.test/2"],
      }}
      onClose={() => {}}
      onSave={save}
    />,
  );
  await screen.findByRole("option", { name: "Cliente Dos" });
  expect(
    (screen.getByLabelText("Cliente / proyecto") as HTMLSelectElement).value,
  ).toBe("p2");
  expect(screen.queryByLabelText("Responsable")).toBeNull();
  expect(screen.queryByLabelText("Canal")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Añadir URL" }));
  await user.type(
    screen.getByLabelText("URL de archivo 3"),
    "https://a.test/3",
  );
  await user.click(screen.getByRole("button", { name: "Eliminar URL 2" }));
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.writes[0]).toMatchObject({
    file_urls: ["https://a.test/1", "https://a.test/3"],
    project_id: "p2",
    status: "idea",
    content_type: "carousel",
  });
  expect(mock.writes[0]).not.toHaveProperty("channel");
  expect(mock.writes[0]).not.toHaveProperty("assignee_id");
  expect(mock.filters).toContainEqual(["updated_at", "2026-10-01"]);
});
it("mantiene datos del formulario cuando otro usuario ha modificado el registro", async () => {
  mock.conflict = true;
  const save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      projectId="p1"
      original={{ id: "a", title: "Existente" }}
      onClose={() => {}}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("El registro cambió"),
  );
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Título *")).toHaveProperty(
    "value",
    "Existente",
  );
});
it("pagina todos los contenidos del mes y filtra por proyecto", async () => {
  const now = new Date();
  mock.content = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i),
    workspace_id: "w",
    project_id: i === 1000 ? "p2" : "p1",
    title: `Contenido ${i}`,
    content_type: "post",
    scheduled_at: now.toISOString(),
  }));
  render(<Calendar scope={scope} />);
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /Post: Contenido/ }),
    ).toHaveLength(1001),
  );
  fireEvent.change(screen.getByLabelText("Cliente / proyecto"), {
    target: { value: "p2" },
  });
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: /Post: Contenido/ }),
    ).toHaveLength(1),
  );
  fireEvent.click(screen.getByRole("button", { name: "Post: Contenido 1000" }));
  expect(
    await screen.findByRole("heading", { name: "Editar contenido" }),
  ).toBeTruthy();
});
it("ordena empates de fecha de forma estable", () => {
  const scheduled_at = new Date(2026, 9, 27, 10).toISOString();
  expect(
    itemsForDay(
      [
        { id: "b", scheduled_at, sort_order: 1 },
        { id: "a", scheduled_at, sort_order: 0 },
        { id: "c", scheduled_at, sort_order: 0 },
      ],
      new Date(2026, 9, 27),
    ).map((row) => row.id),
  ).toEqual(["a", "c", "b"]);
});
