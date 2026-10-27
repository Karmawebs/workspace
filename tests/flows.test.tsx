import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; values: Record<string, unknown> }[],
  session: { user: { id: "user-1", email: "test@example.test" } },
  listener: null as null | ((event: string, session: unknown) => void),
}));
vi.mock("../src/lib/supabase", () => ({
  db: {
    auth: {
      getSession: async () => ({
        data: { session: mock.session },
        error: null,
      }),
      onAuthStateChange: (fn: typeof mock.listener) => {
        mock.listener = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => {
      let mode = "read",
        payload: Record<string, unknown> = {},
        single = false;
      const filters: { key: string; value: unknown }[] = [];
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters.push({ key, value });
          return q;
        },
        order: () => q,
        limit: () => q,
        gte: () => q,
        lt: () => q,
        range: () => q,
        single: () => {
          single = true;
          return q;
        },
        insert: (v: Record<string, unknown>) => {
          mode = "insert";
          payload = v;
          return q;
        },
        update: (v: Record<string, unknown>) => {
          mode = "update";
          payload = v;
          return q;
        },
        delete: () => {
          mode = "delete";
          return q;
        },
        then: (resolve: (v: unknown) => void) => {
          let rows = (mock.tables[table] || []).filter((row) =>
            filters.every((f) => row[f.key] === f.value),
          );
          if (mode === "insert") {
            const row = {
              ...payload,
              id: `new-${mock.writes.length}`,
              created_at: "2026-10-24T12:00:00Z",
            };
            mock.writes.push({ table, values: payload });
            mock.tables[table] = [...(mock.tables[table] || []), row];
            rows = [row];
          }
          if (mode === "update") {
            mock.writes.push({ table, values: payload });
            for (const row of rows) Object.assign(row, payload);
          }
          if (mode === "delete")
            mock.tables[table] = (mock.tables[table] || []).filter(
              (r) => !rows.includes(r),
            );
          return Promise.resolve(
            resolve({ data: single ? rows[0] : rows, error: null }),
          );
        },
      };
      return q;
    },
  },
}));
import { Auth } from "../src/core/Auth";
import { EntityView } from "../src/core/EntityView";
import { Calendar } from "../src/modules/Calendar";
import App from "../src/App";
const scope = {
  workspaceId: "workspace-1",
  app: "social" as const,
  userId: "user-1",
};
beforeEach(() => {
  mock.tables = {
    kw_workspace_members: [
      {
        workspace_id: "workspace-1",
        user_id: "user-1",
        role: "member",
        kw_workspaces: { name: "Test workspace" },
      },
    ],
    kw_apps: ["work", "social", "care"].map((key) => ({
      key,
      workspace_id: "workspace-1",
      enabled: true,
    })),
    kw_app_modules: [],
  };
  mock.writes = [];
  window.location.hash = "";
});
describe("Acceso y navegación", () => {
  it("bloquea una sesión autenticada sin membresía", async () => {
    mock.tables.kw_workspace_members = [];
    render(
      <Auth>
        <h1>Contenido privado</h1>
      </Auth>,
    );
    expect(await screen.findByText("Tu cuenta está lista")).toBeTruthy();
    expect(screen.queryByText("Contenido privado")).toBeNull();
    expect(mock.writes).toHaveLength(0);
  });
  it("no pierde la membresía al renovar el token", async () => {
    render(
      <Auth>
        <h1>Contenido privado</h1>
      </Auth>,
    );
    await screen.findByText("Contenido privado");
    mock.listener?.("TOKEN_REFRESHED", { ...mock.session });
    await waitFor(() =>
      expect(screen.getByText("Contenido privado")).toBeTruthy(),
    );
  });
  it("navega entre Work, Social y Care con Core compartido", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Tu espacio de trabajo" });
    await user.click(screen.getByRole("link", { name: "Social", exact: true }));
    await screen.findByRole("button", { name: "Nuevo proyecto" });
    await user.click(
      screen.getByRole("link", { name: "Calendario", exact: true }),
    );
    await screen.findByRole("heading", { name: "Calendario" });
    await user.click(screen.getByRole("link", { name: "Care", exact: true }));
    await screen.findByRole("button", { name: "Nuevo proyecto" });
    await user.click(
      screen.getByRole("link", { name: "Área técnica", exact: true }),
    );
    await screen.findByRole("button", { name: "Nuevo sitio" });
  });
});
describe("Creación desde la sidebar", () => {
  it("abre el editor Work, guarda con su scope y navega al proyecto", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: "Tu espacio de trabajo" });
    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Nombre *"),
      "Proyecto desde sidebar",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar", exact: true }),
    );
    await screen.findByRole("heading", { name: "Proyecto desde sidebar" });
    expect(mock.writes[0].values).toMatchObject({
      workspace_id: "workspace-1",
      app_key: "work",
      name: "Proyecto desde sidebar",
    });
    expect(window.location.hash).toMatch(/^#\/work\/projects\//);
  });
});
describe("Flujos compartidos", () => {
  it("crea, edita y archiva proyectos en su contexto", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EntityView kind="projects" scope={scope} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Nuevo proyecto" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Nombre *"),
      "Proyecto prueba",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar", exact: true }),
    );
    await screen.findByRole("link", { name: "Proyecto prueba" });
    expect(mock.writes[0].values).toMatchObject({
      workspace_id: "workspace-1",
      app_key: "social",
      name: "Proyecto prueba",
    });
    await user.click(
      screen.getByRole("button", { name: "Editar Proyecto prueba" }),
    );
    await user.clear(screen.getByLabelText("Nombre *"));
    await user.type(screen.getByLabelText("Nombre *"), "Proyecto editado");
    await user.click(
      screen.getByRole("button", { name: "Guardar", exact: true }),
    );
    await screen.findByRole("link", { name: "Proyecto editado" });
    await user.click(
      screen.getByRole("button", { name: "Archivar", exact: true }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: "Proyecto editado" }),
      ).toBeNull(),
    );
    await user.click(screen.getByLabelText("Archivados"));
    await screen.findByRole("link", { name: "Proyecto editado" });
  });
  it("permite tareas independientes sin asociarlas a otro contexto", async () => {
    const user = userEvent.setup();
    render(<EntityView kind="tasks" scope={scope} />);
    await user.click(screen.getByRole("button", { name: "Nueva tarea" }));
    await user.type(screen.getByLabelText("Título *"), "Preparar propuesta");
    await user.click(
      screen.getByRole("button", { name: "Guardar", exact: true }),
    );
    await screen.findByRole("button", {
      name: "Preparar propuesta",
      exact: true,
    });
    expect(mock.writes[0].values).toMatchObject({
      project_id: null,
      workspace_id: "workspace-1",
      app_key: "social",
    });
  });
  it("rechaza un evento con fin anterior al inicio", async () => {
    const user = userEvent.setup();
    render(<EntityView kind="events" scope={scope} />);
    await user.click(screen.getByRole("button", { name: "Nuevo evento" }));
    await user.type(screen.getByLabelText("Título *"), "Sesión");
    fireEvent.change(screen.getByLabelText("Inicio *"), {
      target: { value: "2026-10-24T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Fin"), {
      target: { value: "2026-10-24T09:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Guardar", exact: true }),
    );
    await screen.findByRole("alert");
    expect(mock.writes).toHaveLength(0);
  });
  it("renderiza varias publicaciones el mismo día", async () => {
    const d = new Date();
    mock.tables.kw_content_items = [
      {
        id: "a",
        workspace_id: "workspace-1",
        content_type: "post",
        title: "Sesión A",
        scheduled_at: d.toISOString(),
      },
      {
        id: "b",
        workspace_id: "workspace-1",
        content_type: "post",
        title: "Sesión B",
        scheduled_at: d.toISOString(),
      },
    ];
    render(<Calendar scope={scope} />);
    expect(
      await screen.findByRole("button", { name: /Sesión A/ }),
    ).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: /Sesión B/ }),
    ).toBeTruthy();
  });
});
