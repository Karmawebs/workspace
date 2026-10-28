import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ calls: [] as string[], failed: false }));
vi.mock("../src/lib/supabase", () => ({
  config: { url: "https://test.supabase.co", key: "public" },
  db: {
    from: (table: string) => {
      let operation = "select";
      const q = {
        select: () => q,
        delete: () => {
          operation = "delete";
          return q;
        },
        eq: () => q,
        is: () => q,
        lt: () => q,
        order: () => q,
        limit: () => q,
        in: () => q,
        then: (resolve: (v: unknown) => void) => {
          state.calls.push(`${table}:${operation}`);
          return Promise.resolve(
            resolve({
              error: null,
              data:
                table === "kw_social_storage_cleanup" && operation === "select"
                  ? [{ storage_path: "w/f/original.jpg" }]
                  : [],
            }),
          );
        },
      };
      return q;
    },
    storage: {
      from: () => ({
        remove: async () => {
          state.calls.push("storage:delete");
          return { error: state.failed ? new Error("Offline") : null };
        },
      }),
    },
  },
}));
import {
  cleanSocialMedia,
  mediaType,
  validateMedia,
} from "../src/modules/socialMedia";
beforeEach(() => {
  state.calls = [];
  state.failed = false;
});
it("rejects unsupported extensions, conflicting MIME, empty and oversized files", () => {
  for (const file of [
    new File(["x"], "a.svg", { type: "image/svg+xml" }),
    new File(["x"], "a.jpg", { type: "text/html" }),
    new File([], "a.jpg", { type: "image/jpeg" }),
  ])
    expect(() => mediaType(file)).toThrow();
  expect(() =>
    mediaType({
      name: "huge.mp4",
      type: "video/mp4",
      size: 2147483649,
    } as File),
  ).toThrow(/2048 MB/);
  expect(
    mediaType(new File(["x"], "Photo.JPEG", { type: "image/jpeg" })).mime,
  ).toBe("image/jpeg");
});
it("reads only 32 signature bytes and rejects disguised files", async () => {
  const slice = vi.fn(() => ({
    arrayBuffer: async () =>
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
  }));
  await validateMedia({
    name: "image.png",
    type: "image/png",
    size: 100,
    slice,
  } as unknown as File);
  expect(slice).toHaveBeenCalledWith(0, 32);
  await expect(
    validateMedia({
      name: "fake.png",
      type: "image/png",
      size: 100,
      slice: () => ({
        arrayBuffer: async () =>
          new Uint8Array([60, 104, 116, 109, 108]).buffer,
      }),
    } as unknown as File),
  ).rejects.toThrow(/no coincide/);
});
it("deletes Storage only after DB cleanup intent, then acknowledges", async () => {
  await cleanSocialMedia("w");
  expect(state.calls).toEqual([
    "kw_content_files:delete",
    "kw_social_storage_cleanup:select",
    "storage:delete",
    "kw_social_storage_cleanup:delete",
  ]);
});
it("retains the cleanup queue when Storage fails", async () => {
  state.failed = true;
  await expect(cleanSocialMedia("w")).rejects.toThrow("Offline");
  expect(state.calls).not.toContain("kw_social_storage_cleanup:delete");
});

it("enforces the current 50 MiB bucket limit before upload", () => {
  expect(() =>
    mediaType(
      { name: "large.mp4", type: "video/mp4", size: 52428801 } as File,
      52428800,
    ),
  ).toThrow(/50 MB/);
  expect(
    mediaType(
      { name: "valid.mp4", type: "video/mp4", size: 52428800 } as File,
      52428800,
    ).mime,
  ).toBe("video/mp4");
});
