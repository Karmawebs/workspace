import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ db: { functions: { invoke } } }));
import { finishDrive } from "../src/modules/SocialDriveConnection";
import { SocialDriveBrowser } from "../src/modules/SocialDriveBrowser";

afterEach(() => {
  cleanup();
  invoke.mockReset();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
});
function callback(state: string) {
  sessionStorage.setItem(
    "social-drive-pending",
    JSON.stringify({ projectId: "A", state: "expected" }),
  );
  history.replaceState(
    null,
    "",
    "/social/drive/callback?state=" + state + "&code=test",
  );
}
it("rejects a callback for a different state before exchanging the code", async () => {
  callback("wrong");
  await expect(finishDrive()).rejects.toThrow();
  expect(invoke).not.toHaveBeenCalled();
  expect(location.search).toBe("");
});
it("consumes the browser request once and forwards only the project, state and code", async () => {
  callback("expected");
  invoke.mockResolvedValue({ data: { connected: true } });
  await finishDrive();
  expect(invoke).toHaveBeenCalledWith("social-drive-oauth", {
    body: { projectId: "A", action: "finish", state: "expected", code: "test" },
  });
  await expect(finishDrive()).rejects.toThrow();
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("imports an MP4 from a project subfolder through the existing File interface", async () => {
  const onImport = vi.fn();
  invoke
    .mockResolvedValueOnce({
      data: {
        files: [
          {
            id: "folder",
            name: "Cliente",
            mimeType: "application/vnd.google-apps.folder",
          },
        ],
      },
    })
    .mockResolvedValueOnce({
      data: {
        files: [{ id: "video", name: "clip.mp4", mimeType: "video/mp4" }],
      },
    })
    .mockResolvedValueOnce({ data: new Blob(["test"]) });
  render(<SocialDriveBrowser projectId="A" onImport={onImport} />);
  fireEvent.click(await screen.findByRole("button", { name: /Cliente/ }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /clip.mp4/ }));
  fireEvent.click(screen.getByRole("button", { name: "Añadir al contenido" }));
  await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
  expect(onImport.mock.calls[0][0][0]).toMatchObject({
    name: "clip.mp4",
    type: "video/mp4",
    size: 4,
  });
  expect(invoke.mock.calls[2][1].body).toEqual({
    projectId: "A",
    fileId: "video",
  });
});

it("allows only the loopback test stack in local development", async () => {
  const { readConfig } = await import("../src/lib/config");
  const env = {
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  expect(readConfig(env, true).url).toBe(env.VITE_SUPABASE_URL);
  expect(() => readConfig(env)).toThrow();
  expect(() =>
    readConfig(
      { ...env, VITE_SUPABASE_URL: "https://some-other-project.supabase.co" },
      true,
    ),
  ).toThrow();
});
