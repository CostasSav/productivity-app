// Published calendar links are bearer secrets: anyone holding one can read the calendar.
// The url is stored non-enumerable so JSON.stringify/console.log of a feed never prints it.
export interface CalendarFeed { id: string; label: string; color: string; readonly url: string }

export const ALLOWED_FEED_HOSTS = ['outlook.office365.com', 'outlook.office.com', 'calendar.google.com'];
export const MAX_FEEDS = 5;

export class CalendarConfigError extends Error {
  constructor(readonly code: string) { super(`CALENDAR_FEEDS invalid: ${code}`); this.name = 'CalendarConfigError'; }
}

export function isAllowedFeedUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_FEED_HOSTS.includes(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

// Throws CalendarConfigError with a code that never contains feed contents. Absent → null (feature off).
export function parseCalendarFeeds(raw: string | undefined): CalendarFeed[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new CalendarConfigError('not_json'); }
  if (!Array.isArray(value)) throw new CalendarConfigError('not_array');
  if (value.length === 0) return null;
  if (value.length > MAX_FEEDS) throw new CalendarConfigError('too_many_feeds');
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const at = `feed_${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new CalendarConfigError(`${at}_not_object`);
    const { id, label, color, url } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 32) throw new CalendarConfigError(`${at}_invalid_id`);
    if (ids.has(id)) throw new CalendarConfigError(`${at}_duplicate_id`);
    ids.add(id);
    if (typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw new CalendarConfigError(`${at}_invalid_label`);
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) throw new CalendarConfigError(`${at}_invalid_color`);
    if (!isAllowedFeedUrl(url)) throw new CalendarConfigError(`${at}_invalid_url`);
    const feed = { id, label: label.trim(), color: color.toLowerCase() } as CalendarFeed;
    Object.defineProperty(feed, 'url', { value: url, enumerable: false });
    return feed;
  });
}

// Calendar problems never stop startup: invalid configuration disables only this feature.
export function readCalendarConfig(env: NodeJS.ProcessEnv = process.env, log: (message: string) => void = console.error): CalendarFeed[] | null {
  try { return parseCalendarFeeds(env.CALENDAR_FEEDS); }
  catch (error) {
    log(`[calendar] ${error instanceof CalendarConfigError ? error.message : 'CALENDAR_FEEDS invalid'}; calendar disabled`);
    return null;
  }
}
