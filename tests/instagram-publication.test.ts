import { describe, it, expect, vi } from "vitest";
import {
  advance,
  type Attempt,
  type Publisher,
} from "../supabase/functions/social-instagram-publish/worker";
import {
  formatError,
  geometryError,
} from "../supabase/functions/_shared/instagram-formats";
const jpeg = {
  id: "a",
  mime_type: "image/jpeg",
  size: 1024,
  storage_path: "private/a",
};
const mp4 = {
  ...jpeg,
  id: "b",
  mime_type: "video/mp4",
  storage_path: "private/b",
};
function job(format: string): Attempt {
  return {
    id: "attempt",
    external_account_id: "123",
    format,
    containers: [],
    root_id: null,
    send_started: false,
    snapshot: {
      caption: "Texto",
      files:
        format === "carousel" ? [jpeg, mp4] : [format === "reel" ? mp4 : jpeg],
    },
  };
}
function fixture(a: Attempt) {
  let posts = 0;
  const graph = vi.fn<Publisher["graph"]>(async (path, body) => {
    if (path.endsWith("/media_publish")) {
      expect(a.send_started).toBe(true);
      return { id: "100" };
    }
    if (body) return { id: String(++posts) };
    return path.startsWith("100?")
      ? { permalink: "https://www.instagram.com/p/test/" }
      : { status_code: "FINISHED" };
  });
  return {
    graph,
    sign: vi.fn(async (path: string) => "https://test.invalid/" + path),
    save: vi.fn(async (fields) => {
      Object.assign(a, fields);
    }),
  } satisfies Publisher;
}
describe("Instagram publication", () => {
  it.each(["post", "carousel", "reel", "story", "video story"])(
    "publishes %s only after processing",
    async (format) => {
      const a = job(format === "video story" ? "story" : format);
      if (format === "video story") a.snapshot.files = [mp4];
      const p = fixture(a);
      for (let i = 0; i < 5; i++) if ((await advance(a, p)) === "done") break;
      expect(a).toMatchObject({ state: "published", media_id: "100" });
      const posts = p.graph.mock.calls
        .filter(([, body]) => body)
        .map(([, body]) => Object.fromEntries(body!));
      if (format === "carousel") {
        expect(posts[0]).toMatchObject({
          image_url: expect.any(String),
          is_carousel_item: "true",
        });
        expect(posts[1]).toMatchObject({ media_type: "VIDEO" });
        expect(posts[2]).toMatchObject({
          media_type: "CAROUSEL",
          children: "1,2",
        });
      }
      if (format.includes("story")) {
        expect(posts[0].media_type).toBe("STORIES");
        expect(posts[0]).not.toHaveProperty("caption");
      }
      if (format === "reel") expect(posts[0].media_type).toBe("REELS");
      expect(posts.at(-1)).toHaveProperty("creation_id");
    },
  );
  it("waits for video processing and rejects a failed container before dispatch", async () => {
    const a = { ...job("reel"), root_id: "12" };
    const p = fixture(a);
    p.graph
      .mockResolvedValueOnce({ status_code: "IN_PROGRESS" })
      .mockResolvedValueOnce({ status_code: "ERROR" });
    expect(await advance(a, p)).toBe("wait");
    await expect(advance(a, p)).rejects.toThrow("Meta");
    expect(a.send_started).toBe(false);
  });
  it("reconciles a lost media_publish response without another POST", async () => {
    const a = { ...job("post"), root_id: "12" };
    const p = fixture(a);
    p.graph
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockRejectedValueOnce(new Error("timeout"));
    await expect(advance(a, p)).rejects.toThrow();
    expect(a.send_started).toBe(true);
    p.graph
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockResolvedValueOnce({ status_code: "PUBLISHED" });
    expect(await advance(a, p)).toBe("wait");
    expect(await advance(a, p)).toBe("done");
    expect(
      p.graph.mock.calls.filter(([path]) => path.endsWith("/media_publish")),
    ).toHaveLength(1);
  });
  it("does not send if saving the dispatch fence fails", async () => {
    const a = { ...job("post"), root_id: "12" };
    const p = fixture(a);
    p.save.mockRejectedValueOnce(new Error("lost lease"));
    await expect(advance(a, p)).rejects.toThrow();
    expect(p.graph).toHaveBeenCalledTimes(1);
  });
  it("checks count, format, size, dimensions, duration and caption", () => {
    expect(formatError("carousel", [jpeg, mp4], "")).toBe("");
    for (const files of [[jpeg], Array(11).fill(jpeg)])
      expect(formatError("carousel", files, "")).toBeTruthy();
    expect(formatError("post", [mp4], "")).toBeTruthy();
    expect(formatError("reel", [jpeg], "")).toBeTruthy();
    expect(
      formatError("post", [{ ...jpeg, size: 9 * 1024 ** 2 }], ""),
    ).toBeTruthy();
    expect(formatError("post", [jpeg], "a".repeat(2201))).toBeTruthy();
    expect(geometryError("post", false, 300, 900, 0)).toBeTruthy();
    expect(geometryError("story", true, 1080, 1920, 65)).toBeTruthy();
  });
});

import { inspectOriginal } from "../supabase/functions/social-instagram-publish/inspect";
it("checks the JPEG dimensions from the signed original", async () => {
  const bytes = Uint8Array.from([
    255, 216, 255, 192, 0, 17, 8, 4, 56, 4, 56, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const read = async () => bytes;
  await inspectOriginal(
    "post",
    { mime_type: "image/jpeg", size: bytes.length },
    read,
  );
  bytes[7] = 12;
  await expect(
    inspectOriginal(
      "post",
      { mime_type: "image/jpeg", size: bytes.length },
      read,
    ),
  ).rejects.toThrow("proporción");
});

import { verifiedBusiness } from "../supabase/functions/social-instagram-publish/worker";
it("requires verified Business metadata before enabling stories", () => {
  expect(verifiedBusiness("BUSINESS")).toBe(true);
  for (const t of [null, "CREATOR", "PERSONAL", true])
    expect(verifiedBusiness(t)).toBe(false);
});
