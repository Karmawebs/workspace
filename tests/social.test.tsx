import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  writes: [] as Record<string, unknown>[],
  filters: [] as [string, unknown][],
  content: [] as Record<string, unknown>[],
  conflict: false,
  files: [] as Record<string, unknown>[],
  uploadFails: false,
  uploads: [] as string[],
}));
vi.mock("../src/lib/supabase", () => ({
  db: {
    rpc: (_name: string, args: Record<string, unknown>) => {
      mock.writes.push(args);
      return Promise.resolve({
        data: { id: "saved", ...(args.p_values as object) },
        error: mock.conflict
          ? { message: "El registro cambió o ya no tienes acceso." }
          : null,
      });
    },
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
vi.mock("../src/modules/socialMedia", () => ({
  MEDIA_ACCEPT: ".jpg,.png,.mp4,.mov",
  mediaType: (file: File) => ({ mime: file.type }),
  loadContentFiles: async () => mock.files,
  signedMediaUrl: async (path: string) =>
    `https://private.test/${path}?token=temporary`,
  cleanSocialMedia: async () => {},
  getSocialUploadLimit: async () => 52428800,
  discardReservation: async () => {},
  reserveMedia: async (_ws: string, file: File) => ({
    id: file.name,
    storage_path: file.name,
    original_filename: file.name,
    mime_type: file.type,
    size: file.size,
  }),
  uploadMedia: async (
    file: File,
    _record: unknown,
    progress: (n: number) => void,
  ) => {
    mock.uploads.push(file.name);
    progress(50);
    if (mock.uploadFails && file.type.startsWith("video"))
      throw new Error("Red interrumpida");
    progress(100);
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
  mock.files = [];
  mock.uploadFails = false;
  mock.uploads = [];
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    }),
  );
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
it("unifica el editor y conserva los datos y enlaces antiguos sin ofrecer URLs como flujo principal", async () => {
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
  expect(screen.queryByRole("button", { name: "Añadir URL" })).toBeNull();
  expect(screen.getByText("Archivos anteriores (2)")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.writes[0]).toMatchObject({
    p_values: { project_id: "p2", status: "idea", content_type: "carousel" },
    p_expected_updated_at: "2026-10-01",
    p_file_ids: [],
  });
  expect(mock.writes[0].p_values).not.toHaveProperty("file_urls");
  expect(mock.writes[0].p_values).not.toHaveProperty("channel");
  expect(mock.writes[0].p_values).not.toHaveProperty("assignee_id");
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
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty(
      "disabled",
      false,
    ),
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

it.each([
  ["foto.jpg", "image/jpeg", "post"],
  ["reel.mp4", "video/mp4", "reel"],
  ["clip.mov", "video/quicktime", "story"],
])("crea %s con archivo local", async (name, type, format) => {
  const save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      projectId="p1"
      onClose={() => {}}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText("Título *"), {
    target: { value: "Local" },
  });
  fireEvent.change(screen.getByLabelText("Formato"), {
    target: { value: format },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Seleccionar fotos o vídeos")).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText("Seleccionar fotos o vídeos"), {
    target: { files: [new File(["fixture"], name, { type })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.uploads).toEqual([name]);
  expect(mock.writes[0]).toMatchObject({
    p_file_ids: [name],
    p_values: { title: "Local", content_type: format },
  });
});
it("arrastra un carrusel, cambia portada, elimina y persiste el orden", async () => {
  const save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      projectId="p1"
      onClose={() => {}}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText("Título *"), {
    target: { value: "Carrusel" },
  });
  const files = ["1.jpg", "2.jpg", "3.jpg"].map(
    (name) => new File(["fixture"], name, { type: "image/jpeg" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Seleccionar fotos o vídeos")).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.drop(screen.getByText("Arrastra aquí tus fotos o vídeos"), {
    dataTransfer: { files },
  });
  fireEvent.click(screen.getByRole("button", { name: "Subir archivo 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Subir archivo 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Eliminar archivo 3" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.writes[0].p_file_ids).toEqual(["3.jpg", "1.jpg"]);
});
it("no confirma contenido con subida parcial y reintenta solo el archivo fallido", async () => {
  mock.uploadFails = true;
  const save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      projectId="p1"
      onClose={() => {}}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText("Título *"), {
    target: { value: "Error" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Seleccionar fotos o vídeos")).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText("Seleccionar fotos o vídeos"), {
    target: {
      files: [
        new File(["x"], "foto.jpg", { type: "image/jpeg" }),
        new File(["x"], "reel.mp4", { type: "video/mp4" }),
      ],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("No se ha guardado"),
  );
  expect(screen.getByText(/Red interrumpida/)).toBeTruthy();
  expect(mock.writes).toHaveLength(0);
  expect(save).not.toHaveBeenCalled();
  mock.uploadFails = false;
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.uploads).toEqual(["foto.jpg", "reel.mp4", "reel.mp4"]);
});
it("edita archivos actuales conservando los no modificados", async () => {
  mock.files = [
    {
      id: "existing",
      storage_path: "w/existing/original.jpg",
      original_filename: "existing.jpg",
      mime_type: "image/jpeg",
      size: 100,
      sort_order: 0,
    },
  ];
  const save = vi.fn();
  render(
    <Editor
      def={entities.content}
      scope={scope}
      projectId="p1"
      original={{ id: "a", title: "Existente", updated_at: "2026-10-27" }}
      onClose={() => {}}
      onSave={save}
    />,
  );
  await screen.findByText("existing.jpg");
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(mock.uploads).toHaveLength(0);
  expect(mock.writes[0].p_file_ids).toEqual(["existing"]);
});
it("prioriza portada privada sobre URLs antiguas en calendario", async () => {
  mock.files = [
    {
      id: "private",
      storage_path: "w/private/original.jpg",
      mime_type: "image/jpeg",
    },
  ];
  render(
    <SocialContentDot
      row={{
        id: "a",
        workspace_id: "w",
        title: "Privado",
        file_urls: ["https://legacy.test/photo.jpg"],
      }}
      onEdit={() => {}}
    />,
  );
  fireEvent.focus(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "https://private.test/w/private/original.jpg?token=temporary",
    ),
  );
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByText("Sin vista previa")).toBeTruthy();
});
