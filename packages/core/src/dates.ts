// Local dates (`YYYY-MM-DD`) are calendar days; the arithmetic runs in UTC so DST never shifts a day.
const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

// The Monday–Sunday week containing the date (§5.11).
export function weekOf(date: string): { start: string; end: string } {
  const sinceMonday = (new Date(Date.parse(date)).getUTCDay() + 6) % 7;
  const start = addDays(date, -sinceMonday);
  return { start, end: addDays(start, 6) };
}
