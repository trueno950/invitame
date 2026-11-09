const instant = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  hourCycle: "h23",
  timeZone: "America/Mexico_City",
});

/** An ISO instant as `9 nov 2026, 12:30` in Mexico City time; empty when it is not a date. */
export function formatInstant(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : instant.format(time);
}
