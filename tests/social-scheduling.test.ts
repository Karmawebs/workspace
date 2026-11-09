import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mainState, itemsForDay } from "../src/modules/socialContent";
it("keeps editorial dates inert and prioritises real results", () => {
  expect(
    mainState({
      id: "1",
      status: "scheduled",
      scheduled_at: new Date().toISOString(),
    }),
  ).toBe("draft");
  expect(
    mainState({
      id: "1",
      status: "scheduled",
      publication_state: "publishing",
    }),
  ).toBe("publishing");
  const row = {
    id: "1",
    calendar_at: "2026-11-10T12:00:00Z",
    scheduled_at: "2026-11-09T12:00:00Z",
    main_state: "cancelled",
  };
  expect(itemsForDay([row], new Date(row.calendar_at))).toEqual([row]);
  expect(itemsForDay([row], new Date(row.scheduled_at))).toEqual([]);
});
it("rejects the missing Madrid spring hour and offers both autumn offsets", () => {
  // Run in a separate process: browser timezone is fixed at startup in production.
  const result = execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      `
  import * as api from './src/modules/socialScheduleTime.ts';
  let invalid=false;try{api.scheduleInstants('2027-03-28','02:30')}catch{invalid=true}
  console.log(JSON.stringify([invalid,api.scheduleInstants('2027-10-31','02:30')]));
 `,
    ],
    { env: { ...process.env, TZ: "Europe/Madrid" } },
  ).toString();
  expect(JSON.parse(result)).toEqual([
    true,
    ["2027-10-31T00:30:00.000Z", "2027-10-31T01:30:00.000Z"],
  ]);
});
