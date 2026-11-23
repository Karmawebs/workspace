import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { movableContent, mainState } from "../src/modules/socialContent";
import {
  mediaURL,
  normalizeMedia,
} from "../supabase/functions/social-instagram-sync/media";
it("locks real, legacy and ambiguous publications", () => {
  for (const row of [
    { status: "published" },
    { published_at: "2026-01-01" },
    { publication_state: "published" },
    { publication_state: "publishing" },
    { send_started: true },
  ])
    expect(movableContent({ id: "x", ...row })).toBe(false);
  expect(movableContent({ id: "x", publication_state: "scheduled" })).toBe(
    true,
  );
  expect(mainState({ id: "x", status: "published" })).toBe("published");
});
it("moves only the local day and preserves 19:00 across Madrid DST", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `import {movePublicationDay} from './src/modules/socialScheduleTime.ts';console.log(JSON.stringify([movePublicationDay('2026-11-26T18:00:12.123Z','2026-11-28'),movePublicationDay('2027-03-27T18:00:00Z','2027-03-29')]));`,
    ],
    { env: { ...process.env, TZ: "Europe/Madrid" } },
  ).toString();
  expect(JSON.parse(output)).toEqual([
    "2026-11-28T18:00:12.123Z",
    "2027-03-29T17:00:00.000Z",
  ]);
});
it("rejects incomplete Meta data and unsafe media hosts", () => {
  expect(() => normalizeMedia({ id: "123" })).toThrow();
  expect(() =>
    normalizeMedia({
      id: "123",
      timestamp: "2026-11-01",
      children: { data: [], paging: { next: "more" } },
    }),
  ).toThrow();
  expect(() => mediaURL("https://cdninstagram.com.evil.test/x")).toThrow();
  expect(() => mediaURL("http://cdninstagram.com/x")).toThrow();
  expect(mediaURL("https://scontent.cdninstagram.com/x")).toBe(
    "https://scontent.cdninstagram.com/x",
  );
});
