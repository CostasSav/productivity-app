// Local-calendar date helpers. Date keys are YYYY-MM-DD in the browser's time zone,
// never derived from toISOString() (which is UTC and wrong around midnight in France).

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTodayStr(now: Date = new Date()): string {
  return dateKey(now);
}

/** Local midnight of a date key. Uses the (y, m, d) constructor so DST days get their real length. */
export function parseDateKey(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function offsetDay(dateStr: string, n: number): string {
  const d = parseDateKey(dateStr);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Monday → Sunday week containing dateStr. */
export function weekOf(dateStr: string): string[] {
  const d = parseDateKey(dateStr);
  const monday = offsetDay(dateStr, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => offsetDay(monday, i));
}
