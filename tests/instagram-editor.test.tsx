import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
const fixture = vi.hoisted(() => ({
  accounts: [] as Record<string, unknown>[],
  invoke: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  db: {
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        then: (f: Function) => Promise.resolve(f({ data: fixture.accounts })),
      };
      return q;
    },
    functions: { invoke: fixture.invoke },
  },
}));
vi.mock("../src/modules/socialMedia", () => ({
  signedMediaUrl: async () => "/fixture.jpg",
}));
import { InstagramPublishControls } from "../src/modules/InstagramPublishControls";
import type { MediaItem } from "../src/modules/SocialMediaPicker";
describe("editor publication consent", () => {
  const account = {
    id: "instagram",
    project_id: "project",
    username: "fixture",
    authorized_scopes: ["instagram_content_publish"],
    expires_at: null,
  };
  const items = [
    {
      key: "file",
      record: { mime_type: "image/jpeg", size: 15, storage_path: "private" },
      progress: 100,
      status: "saved",
    },
  ] as MediaItem[];
  function mount(due?: string) {
    const confirm = vi.fn();
    render(
      <form>
        <InstagramPublishControls
          projectId="project"
          contentId="content"
          items={items}
          due={due}
          format="post"
          caption="Un copy"
          blocked={false}
          failed={false}
          onConfirm={confirm}
        />
      </form>,
    );
    return confirm;
  }
  beforeEach(() => {
    fixture.accounts = [];
    fixture.invoke.mockReset();
  });
  it.each(["missing", "expired", "wrong project", "missing permission"])(
    "blocks %s connection",
    async (which) => {
      fixture.accounts =
        which === "missing"
          ? []
          : [
              {
                ...account,
                ...(which === "expired"
                  ? { expires_at: "2000-01-01" }
                  : which === "wrong project"
                    ? { project_id: "other" }
                    : { authorized_scopes: [] }),
              },
            ];
      mount();
      await screen.findByText(
        "Selecciona un proyecto con una cuenta de Instagram conectada.",
      );
      expect(
        (
          screen.getByRole("button", {
            name: "Publicar ahora",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(fixture.invoke).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "requires explicit confirmation after preview, scheduled=%s",
    async (scheduling) => {
      const due = scheduling
        ? new Date(Date.now() + 3600000).toISOString()
        : undefined;
      fixture.accounts = [account];
      const image = vi.spyOn(window, "Image").mockImplementation(function () {
        const el = document.createElement("img");
        Object.defineProperties(el, {
          naturalWidth: { value: 1080 },
          naturalHeight: { value: 1080 },
          src: {
            set() {
              queueMicrotask(() => el.dispatchEvent(new Event("load")));
            },
          },
        });
        return el;
      } as typeof Image);
      try {
        const confirm = mount(due),
          start = screen.getByRole("button", {
            name: scheduling ? "Programar publicación" : "Publicar ahora",
          }) as HTMLButtonElement;
        await waitFor(() => expect(start.disabled).toBe(false));
        fireEvent.click(start);
        let dialog = within(screen.getByRole("dialog"));
        expect(dialog.getByText("Un copy")).toBeTruthy();
        fireEvent.click(dialog.getByText("Cancelar"));
        expect(confirm).not.toHaveBeenCalled();
        fireEvent.click(start);
        dialog = within(screen.getByRole("dialog"));
        fireEvent.click(
          dialog.getByRole("button", {
            name: scheduling
              ? "Confirmar programación"
              : "Confirmar publicación",
          }),
        );
        expect(confirm).toHaveBeenCalledWith({
          ...(scheduling ? { due } : {}),
          connectionId: "instagram",
          attemptId: expect.any(String),
        });
      } finally {
        image.mockRestore();
      }
    },
  );
});
