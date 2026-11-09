export function publicationTimestamp(
  date: string,
  time: string,
): string | null {
  if (!date && !time) return null;
  if (!date || !time)
    throw new Error("Indica fecha y hora de publicación, o deja ambas vacías.");
  const value = new Date(`${date}T${time}`);
  // Reject nonexistent local times during the spring daylight-saving transition.
  if (
    Number.isNaN(value.getTime()) ||
    [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-") !== date ||
    `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}` !==
      time
  )
    throw new Error("La fecha u hora no existe en tu zona horaria.");
  return value.toISOString();
}

// Date chooses the earlier occurrence of an overlapping local time. Offer both UTC instants.
export function scheduleInstants(date: string, time: string) {
  const first = publicationTimestamp(date, time);
  if (!first) return [];
  const start = new Date(first);
  const tomorrow = new Date(start);
  tomorrow.setDate(start.getDate() + 1);
  const difference = tomorrow.getTimezoneOffset() - start.getTimezoneOffset();
  const later = new Date(start.getTime() + difference * 60000);
  return difference > 0 &&
    later.getHours() === start.getHours() &&
    later.getMinutes() === start.getMinutes() &&
    later.getDate() === start.getDate()
    ? [first, later.toISOString()]
    : [first];
}
