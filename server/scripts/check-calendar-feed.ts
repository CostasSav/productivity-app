// Owner-only check of ONE published calendar feed, run in your own terminal:
//   npm run calendar:check -w server [-- --from YYYY-MM-DD --to YYYY-MM-DD]
// The URL is read only from a hidden prompt: never from arguments, env vars or files. It is never
// printed, and nothing is written to disk. Uses the server's own validation, fetch and parse code.
import { parseCalendarFeeds, CalendarConfigError } from '../src/calendar/config';
import { fetchFeed, parseFeedOccurrences, syncWindow, FeedError, type ParsedOccurrence } from '../src/calendar/sync';
import { hiddenInput } from './hiddenInput';

const ZONE = 'Europe/Paris';
const DAY = 86400000;
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeOf = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const headingParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const heading = (date: Date) => {
  const p = Object.fromEntries(headingParts.formatToParts(date).map(part => [part.type, part.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
};

const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const isDay = (value: string) => {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};
const truncate = (title: string) => (title.length > 40 ? `${title.slice(0, 39)}…` : title);

export interface CheckOptions {
  args: string[];
  readUrl: () => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: Date;
  out?: (line: string) => void;
}

function parseArgs(args: string[], now: Date): { from: string; to: string } | string {
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if ((name === '--from' || name === '--to') && i + 1 < args.length && !(name.slice(2) in options)) { options[name.slice(2)] = args[++i]; continue; }
    // Never echo the argument: it might be a pasted URL.
    return 'Only --from YYYY-MM-DD and --to YYYY-MM-DD are accepted. The feed URL is asked for at a hidden prompt.';
  }
  const today = dayKey.format(now);
  const from = options.from ?? today;
  const to = options.to ?? addDays(from, 7);
  if (!isDay(from) || !isDay(to)) return '--from and --to must be real dates in YYYY-MM-DD format.';
  if (to < from) return '--to must not be before --from.';
  const window = syncWindow(now);
  const first = window.from.toISOString().slice(0, 10), last = window.to.toISOString().slice(0, 10);
  if (from < first || to > last) return `Dates must stay within the sync window ${first} to ${last}.`;
  return { from, to };
}

export async function runCheck({ args, readUrl, fetchImpl, now = new Date(), out = line => console.log(line) }: CheckOptions): Promise<number> {
  const range = parseArgs(args, now);
  if (typeof range === 'string') { out(range); return 2; }

  const url = (await readUrl()).trim();
  let feeds;
  try { feeds = parseCalendarFeeds(JSON.stringify([{ id: 'check', label: 'Check', color: '#000000', url }])); }
  catch (error) {
    out(`URL rejected by CALENDAR_FEEDS validation (${error instanceof CalendarConfigError ? error.code.replace(/^feed_1_/, '') : 'invalid'}).`);
    out('It must be https:// on outlook.office365.com, outlook.office.com or calendar.google.com (replace webcal:// with https://).');
    return 1;
  }
  if (!feeds) { out('No URL entered.'); return 1; }

  let occurrences: ParsedOccurrence[];
  try {
    const body = await fetchFeed(feeds[0].url, { fetchImpl });
    occurrences = parseFeedOccurrences(body, 'check', syncWindow(now));
  } catch (error) {
    out(`Feed status: ${error instanceof FeedError ? error.status : 'parse_error'}`);
    return 1;
  }

  // Group by local day in Europe/Paris. All-day events appear on every day they cover;
  // timed events under their start day.
  const days = new Map<string, string[]>();
  const listed = new Set<string>();
  let allDayCount = 0, recurringCount = 0;
  const add = (day: string, line: string, occurrence: ParsedOccurrence) => {
    if (day < range.from || day > range.to) return;
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(line);
    if (!listed.has(occurrence.event.id)) {
      listed.add(occurrence.event.id);
      if (occurrence.event.allDay) allDayCount++;
      if (occurrence.recurring) recurringCount++;
    }
  };
  for (const occurrence of occurrences) {
    const { event, recurring } = occurrence;
    const marker = recurring ? 'rec' : '   ';
    if (event.allDay) {
      for (let day = event.start.slice(0, 10); day < event.end.slice(0, 10); day = addDays(day, 1)) {
        add(day, `  ${'all day'.padEnd(18)} ${marker}  ${truncate(event.title)}`, occurrence);
      }
      continue;
    }
    const start = new Date(event.start), end = new Date(event.end);
    const startDay = dayKey.format(start);
    const extra = Math.round((Date.parse(`${dayKey.format(new Date(Math.max(start.getTime(), end.getTime() - 1)))}T00:00:00Z`) - Date.parse(`${startDay}T00:00:00Z`)) / DAY);
    const time = `${timeOf.format(start)}–${timeOf.format(end)}${extra > 0 ? ` (+${extra})` : ''}`;
    add(startDay, `  ${time.padEnd(18)} ${marker}  ${truncate(event.title)}`, occurrence);
  }

  out(`Events from ${range.from} to ${range.to} (Europe/Paris). rec = occurrence of a recurring series.`);
  for (const day of [...days.keys()].sort()) {
    out('');
    out(heading(new Date(`${day}T00:00:00Z`)));
    for (const line of days.get(day)!) out(line);
  }
  out('');
  out(`Total: ${listed.size} event${listed.size === 1 ? '' : 's'} on ${days.size} day${days.size === 1 ? '' : 's'} (${allDayCount} all-day, ${recurringCount} recurring).`);
  out('Feed status: ok');
  return 0;
}

if (require.main === module) {
  runCheck({ args: process.argv.slice(2), readUrl: () => hiddenInput('Paste ONE feed URL (input is hidden): ', 2048) })
    .then(code => { process.exitCode = code; })
    .catch(() => { console.error('Check failed or was cancelled. Run it in an interactive terminal.'); process.exitCode = 1; });
}
