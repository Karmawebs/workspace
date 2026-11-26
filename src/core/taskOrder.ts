import type { Row } from "./model";

/** Reorder visible items while keeping the positions of filtered-out tasks. */
export function taskOrderChanges(
  all: Row[],
  visible: Row[],
  from: string,
  to: string,
) {
  const start = visible.findIndex((row) => row.id === from);
  const end = visible.findIndex((row) => row.id === to);
  if (start < 0 || end < 0 || start === end) return [];
  const ordered = [...visible];
  const [moved] = ordered.splice(start, 1);
  ordered.splice(end, 0, moved);
  const visibleIds = new Set(visible.map((row) => row.id));
  let i = 0;
  return all
    .map((row) => (visibleIds.has(row.id) ? ordered[i++] : row))
    .map((row, index) => ({ row, sortOrder: index + 1 }))
    .filter(({ row, sortOrder }) => row.sort_order !== sortOrder);
}
