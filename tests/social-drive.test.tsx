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
import {
  finishDrive,
  SocialDriveConnection,
} from "../src/modules/SocialDriveConnection";
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

it("shows the existing project's folder and updates it through the same binding action", async () => {
  let folder = { id: "existing_folder", name: "Garden Nails" };
  const onChange = vi.fn();
  invoke.mockImplementation(async (_name, { body }) => {
    expect(body.projectId).toBe("A");
    if (body.action === "status")
      return {
        data: {
          status: "connected",
          account: { name: "Karma", email: "test@example.com" },
          folder,
          canChoose: true,
        },
      };
    if (body.action === "folders")
      return {
        data: {
          files: body.folderId
            ? []
            : [{ id: "new_folder", name: "Nueva carpeta" }],
        },
      };
    if (body.action === "bind") {
      expect(body.folderId).toBe("new_folder");
      folder = { id: "new_folder", name: "Nueva carpeta" };
      return { data: { linked: true } };
    }
    throw new Error("unexpected action");
  });
  render(
    <SocialDriveConnection projectId="A" onChange={onChange} showStatus />,
  );
  expect(await screen.findByText("Garden Nails")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Abrir carpeta en Drive" })
      .getAttribute("href"),
  ).toBe("https://drive.google.com/drive/folders/existing_folder");
  fireEvent.click(screen.getByRole("button", { name: "Cambiar carpeta" }));
  fireEvent.click(await screen.findByRole("button", { name: "Nueva carpeta" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Vincular esta carpeta" }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("link", { name: "Abrir carpeta en Drive" })
        .getAttribute("href"),
    ).toBe("https://drive.google.com/drive/folders/new_folder"),
  );
  expect(onChange).toHaveBeenCalledOnce();
});

it("does not offer folder selection to an administrator other than the Google account owner", async () => {
  invoke.mockResolvedValue({
    data: {
      status: "connected",
      account: { name: "Google Drive" },
      folder: null,
      canChoose: false,
    },
  });
  render(
    <SocialDriveConnection projectId="B" onChange={() => {}} showStatus />,
  );
  expect(
    await screen.findByText(
      "Solo quien autorizó esta cuenta puede cambiar la carpeta.",
    ),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Elegir carpeta",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
