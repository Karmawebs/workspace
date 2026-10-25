export const urgencyLevels = [
  { value: "high", label: "Alta", color: "red" },
  { value: "normal", label: "Media", color: "yellow" },
  { value: "low", label: "Baja", color: "green" },
] as const;

export function projectUrgency(priority: unknown) {
  return urgencyLevels.find(level => level.value === (priority === "urgent" ? "high" : priority)) ?? urgencyLevels[1];
}
