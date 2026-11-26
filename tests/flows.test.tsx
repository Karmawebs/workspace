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
Object.defineProperty(window,"matchMedia",{writable:true,value:vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}))});
const mock = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; values: Record<string, unknown> }[],
  session: { user: { id: "user-1", email: "test@example.test" } },
  listener: null as null | ((event: string, session: unknown) => void),
}));
vi.mock("../src/lib/supabase", () => ({
  config: {url:"https://fixture.supabase.co",key:"fixture-key"},
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
      let order: { key: string; ascending: boolean } | undefined;
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
        order: (key: string, options?: { ascending: boolean }) => {
          order = { key, ascending: options?.ascending ?? true };
          return q;
        },
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
          if (table === "kw_events" && order) {
            const {key, ascending} = order;
            rows.sort((a,b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (ascending ? 1 : -1));
          }
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
import { WorkJournal } from "../src/core/WorkJournal";
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
    await within(screen.getByRole("main")).findByRole("button", { name: "Nuevo proyecto" });
    await user.click(
      screen.getByRole("link", { name: "Calendario", exact: true }),
    );
    await screen.findByRole("heading", { name: "Calendario" });
    await user.click(screen.getByRole("link", { name: "Care", exact: true }));
    await within(screen.getByRole("main")).findByRole("button", { name: "Nuevo proyecto" });
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
  it("compacta reuniones Social y abre el contenido completo desde el título o la fecha", async () => {
    const user = userEvent.setup();
    mock.tables.kw_events = [{
      id: "meeting-1", workspace_id: scope.workspaceId, app_key: "social",
      project_id: "project-1", title: "Sesión de contenido", type: "meeting",
      starts_at: "2026-11-26T14:00:00Z", description: "Notas completas de la reunión",
      metadata: {
        checklist: [{ title: "Preparar fotos", completed: false }],
        attachments: [{ id: "attachment-1", file_name: "brief.pdf", file_url: "https://example.test/brief.pdf" }],
      },
    }];
    render(<EntityView kind="events" scope={scope} projectId="project-1" compact/>);
    const title = await screen.findByText("Sesión de contenido");
    const row = title.closest("article")!;
    expect(row.classList.contains("social-meeting-record")).toBe(true);
    expect(row.querySelector("small")?.textContent).toContain("26 nov 2026");
    expect(within(row).queryByText("Notas completas de la reunión")).toBeNull();
    expect(within(row).getByRole("button", { name: "Editar Sesión de contenido" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "Eliminar Sesión de contenido" })).toBeTruthy();
    await user.click(row.querySelector("small")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Notas completas de la reunión")).toBeTruthy();
    expect(within(dialog).getByDisplayValue("Preparar fotos")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "brief.pdf" })).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await user.click(screen.getByRole("button", { name: "Editar Sesión de contenido" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
  });
  it("ordena reuniones de Social por creación descendente aunque tengan fecha anterior", async () => {
    const shared = {workspace_id:scope.workspaceId, app_key:"social", project_id:"project-1", type:"meeting"};
    mock.tables.kw_events = [
      {...shared, id:"old", title:"Primera reunión", starts_at:"2026-12-05T10:00:00Z", created_at:"2026-11-01T10:00:00Z"},
      {...shared, id:"new", title:"Última añadida", starts_at:"2026-10-01T10:00:00Z", created_at:"2026-11-26T14:00:00Z"},
    ];
    render(<EntityView kind="events" scope={scope} projectId="project-1" compact/>);
    await screen.findByText("Última añadida");
    const rows = screen.getAllByRole("article");
    expect(rows[0].textContent).toContain("Última añadida");
    expect(rows[1].textContent).toContain("Primera reunión");
  });
  it("mantiene los controles del diario Social juntos e independientes", async () => {
    const user = userEvent.setup();
    mock.tables.kw_journal_entries = [{
      id:"journal-1", workspace_id:scope.workspaceId, app_key:"social", project_id:"project-1",
      title:"Entrada", body:"Resumen de una reunión con notas completas", entry_date:"2026-11-26",
      created_at:"2026-11-26T14:00:00Z"
    }];
    render(<WorkJournal scope={scope} projectId="project-1"/>);
    const toggle = await screen.findByRole("button", {name:/Resumen de una reunión/});
    const edit = screen.getByRole("button", {name:/Editar entrada/});
    expect(toggle.nextElementSibling).toBe(edit);
    expect(toggle.closest(".work-journal--minimal")).toBeNull();
    expect(toggle.parentElement?.classList.contains("social-journal-entry-header")).toBe(true);
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(edit);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
  it.each(["work", "care"] as const)("muestra el diario minimalista de %s con edición junto a la fecha", async (app) => {
    const user = userEvent.setup();
    const localScope = {...scope, app};
    mock.tables.kw_journal_entries = [{
      id:"journal-1", workspace_id:scope.workspaceId, app_key:app, project_id:"project-1",
      title:"Entrada", body:"Notas completas del proyecto", entry_date:"2026-11-26",
      created_at:"2026-11-26T14:00:00Z"
    }];
    const {container} = render(<WorkJournal scope={localScope} projectId="project-1"/>);
    const edit = await screen.findByRole("button", {name:/Editar entrada/});
    expect(container.querySelector(".work-journal--minimal .work-journal-input")).toBeTruthy();
    expect(edit.previousElementSibling?.tagName).toBe("TIME");
    expect(edit.parentElement?.classList.contains("work-journal-entry-heading")).toBe(true);
    expect(screen.getByText("Notas completas del proyecto")).toBeTruthy();
    await user.click(edit);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mock.writes).toHaveLength(0);
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
    mock.tables.kw_social_content_delivery = [
      {
        id: "a",
        workspace_id: "workspace-1",
        content_type: "post",
        title: "Sesión A",
        publication_state: "published",
        calendar_at: d.toISOString(),
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
