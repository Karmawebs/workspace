import { describe, expect, it } from "vitest";
import { taskOrderChanges } from "../src/core/taskOrder";
import type { Row } from "../src/core/model";

const row = (id: string, sort_order = 0): Row => ({ id, sort_order });
describe("Task manual priority", () => {
  it("moves an item up or down without changing the positions of filtered tasks", () => {
    const all = [row("a"), row("hidden"), row("b"), row("c")];
    const visible = all.filter((r) => r.id !== "hidden");
    expect(
      taskOrderChanges(all, visible, "c", "a").map((x) => [
        x.row.id,
        x.sortOrder,
      ]),
    ).toEqual([
      ["c", 1],
      ["hidden", 2],
      ["a", 3],
      ["b", 4],
    ]);
    expect(
      taskOrderChanges(all, visible, "a", "c").map((x) => [
        x.row.id,
        x.sortOrder,
      ]),
    ).toEqual([
      ["b", 1],
      ["hidden", 2],
      ["c", 3],
      ["a", 4],
    ]);
  });
  it("ignores missing and unchanged targets", () => {
    const all = [row("a", 1), row("b", 2)];
    expect(taskOrderChanges(all, all, "a", "a")).toEqual([]);
    expect(taskOrderChanges(all, all, "a", "unknown")).toEqual([]);
  });
  it("only writes ranks that changed", () => {
    const all = [row("a", 1), row("b", 2), row("c", 3)];
    expect(
      taskOrderChanges(all, all, "a", "b").map((x) => [x.row.id, x.sortOrder]),
    ).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });
});
