import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ db: { functions: { invoke } } }));
import { InstagramCallback } from "../src/modules/InstagramConnection";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  invoke.mockReset();
});
function pending() {
  sessionStorage.setItem(
    "kw-instagram-pending",
    JSON.stringify({ projectId: "A", state: "abc" }),
  );
}
it("rejects mismatched or cancelled Meta callbacks before invoking the server", async () => {
  pending();
  render(
    <InstagramCallback
      params={new URLSearchParams({ state: "other", code: "unused" })}
    />,
  );
  await screen.findByText(/ya se utilizó/);
  expect(invoke).not.toHaveBeenCalled();
  cleanup();
  pending();
  render(
    <InstagramCallback
      params={new URLSearchParams({ state: "abc", error: "access_denied" })}
    />,
  );
  await screen.findByText(/Autorización cancelada/);
  expect(invoke).not.toHaveBeenCalled();
});
it("completes a callback for its originating project and consumes the request", async () => {
  pending();
  invoke.mockResolvedValue({ data: { connected: true } });
  render(
    <InstagramCallback
      params={new URLSearchParams({ state: "abc", code: "code" })}
    />,
  );
  await screen.findByText("Cuenta de Instagram conectada.");
  expect(invoke).toHaveBeenCalledWith("social-instagram", {
    body: { action: "finish", state: "abc", projectId: "A", code: "code" },
  });
  expect(sessionStorage.getItem("kw-instagram-pending")).toBeNull();
});
