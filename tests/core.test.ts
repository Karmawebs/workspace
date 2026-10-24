import { describe, it, expect, vi } from "vitest";
vi.mock("../src/lib/supabase", () => ({ db: {} }));
import { readConfig } from "../src/lib/config";
import { safeUrl, dayKey, localInput } from "../src/core/model";
import { eventsForDay } from "../src/modules/Calendar";
import { entities } from "../src/core/entities";
describe("Backend y enlaces seguros", () => {
  it("solo admite el proyecto destino y claves públicas", () => {
    expect(
      readConfig({
        VITE_SUPABASE_URL: "https://wrkoskqfjuefgrwhymqu.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }).url,
    ).toContain("wrkoskq");
    expect(() =>
      readConfig({
        VITE_SUPABASE_URL: "https://vjsmsekbsjngdtuxfbmu.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toThrow();
    expect(() =>
      readConfig({
        VITE_SUPABASE_URL: "https://wrkoskqfjuefgrwhymqu.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test",
      }),
    ).toThrow();
  });
  it("rechaza scripts y URLs con credenciales", () => {
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://user:password@example.com")).toBeUndefined();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
});
describe("Calendario y Core", () => {
  it("conserva todos los eventos del mismo día y ordena por hora", () => {
    const d = new Date(2026, 9, 24);
    const events = [
      { id: "b", starts_at: new Date(2026, 9, 24, 16).toISOString() },
      { id: "a", starts_at: new Date(2026, 9, 24, 9).toISOString() },
      { id: "c", starts_at: new Date(2026, 9, 25, 9).toISOString() },
    ];
    expect(eventsForDay(events, d).map((e) => e.id)).toEqual(["a", "b"]);
  });
  it("incluye eventos que cruzan medianoche sin añadir un día al finalizar a las 00:00", () => {
    const e = [
      {
        id: "a",
        starts_at: new Date(2026, 9, 23, 22).toISOString(),
        ends_at: new Date(2026, 9, 25, 0).toISOString(),
      },
    ];
    expect(eventsForDay(e, new Date(2026, 9, 24))).toHaveLength(1);
    expect(eventsForDay(e, new Date(2026, 9, 25))).toHaveLength(0);
  });
  it("mantiene la fecha local al editar", () => {
    const d = new Date(2026, 9, 24, 16, 30);
    expect(localInput(d.toISOString())).toBe("2026-10-24T16:30");
    expect(dayKey(d)).toBe("2026-10-24");
  });
  it("las entidades específicas reutilizan el mismo contrato y las tablas existentes", () => {
    expect(entities.milestones.table).toBe("kw_project_milestones");
    expect(entities.content.table).toBe("kw_content_items");
    expect(entities.sites.table).toBe("kw_care_sites");
    expect(entities.connections.table).toBe("kw_connections");
    expect(entities.clients).not.toHaveProperty("appScoped");
    for (const e of [
      "projects",
      "tasks",
      "events",
      "journal",
      "alerts",
      "resources",
    ] as const)
      expect(entities[e].appScoped).toBe(true);
  });
});
