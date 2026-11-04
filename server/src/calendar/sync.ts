import { createHash } from 'node:crypto';
import ical, { type VEvent } from 'node-ical';
import { isAllowedFeedUrl } from './config';

// 'pending' = configured but not fetched yet in this process and absent from the cache.
export type FeedStatus = 'pending' | 'ok' | 'timeout' | 'http_error' | 'parse_error' | 'disabled';

// The only fields that ever leave this module. Descriptions, locations, attendees, organizers,
// URLs and conference links are dropped here, at parse time, and the raw .ics is never kept.
export interface CalendarEvent { id: string; feedId: string; title: string; start: string; end: string; allDay: boolean }

// Carries only a status code: messages of the underlying fetch/parse errors can embed the feed URL.
export class FeedError extends Error {
  constructor(readonly status: Exclude<FeedStatus, 'ok' | 'pending'>) { super(`Calendar feed ${status}`); this.name = 'FeedError'; }
}

export interface FetchOptions { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number; maxRedirects?: number }

export const FETCH_TIMEOUT_MS = 15000;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const MAX_EVENTS_PER_FEED = 5000;
const DAY = 86400000;

export async function fetchFeed(url: string, options: FetchOptions = {}): Promise<string> {
  const { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_FEED_BYTES, maxRedirects = 5 } = options;
  // One deadline covers every redirect hop and the body download.
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  try {
    for (let hop = 0; ; hop++) {
      if (!isAllowedFeedUrl(current)) throw new FeedError('http_error');
      const response = await fetchImpl(current, { redirect: 'manual', signal, headers: { Accept: 'text/calendar' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location || hop >= maxRedirects) throw new FeedError('http_error');
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => undefined);
        throw new FeedError('http_error');
      }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body.cancel().catch(() => undefined);
        throw new FeedError('http_error');
      }
      return await readCapped(response.body, maxBytes);
    }
  } catch (error) {
    if (error instanceof FeedError) throw error;
    if (signal.aborted) throw new FeedError('timeout');
    throw new FeedError('http_error');
  }
}

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new FeedError('http_error');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

// Expansion window: [today − 14 days, today + 90 days], in UTC days.
export function syncWindow(now: Date): { from: Date; to: Date } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { from: new Date(today - 14 * DAY), to: new Date(today + 91 * DAY - 1) };
}

function cleanTitle(summary: unknown): string {
  const raw = summary && typeof summary === 'object' && 'val' in summary ? (summary as { val: unknown }).val : summary;
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, 200) : 'Busy';
}

// node-ical returns date-only values as local midnight of the server process; keep the calendar date.
function dateOnly(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T00:00:00.000Z`;
}

const valid = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

export function parseFeed(body: string, feedId: string, window: { from: Date; to: Date }, maxEvents = MAX_EVENTS_PER_FEED): CalendarEvent[] {
  return parseFeedOccurrences(body, feedId, window, maxEvents).map(occurrence => occurrence.event);
}

/** Same parse, plus whether each occurrence came from a recurring series (used by the owner's check script). */
export interface ParsedOccurrence { event: CalendarEvent; recurring: boolean }

export function parseFeedOccurrences(body: string, feedId: string, window: { from: Date; to: Date }, maxEvents = MAX_EVENTS_PER_FEED): ParsedOccurrence[] {
  if (!/^\s*BEGIN:VCALENDAR/i.test(body)) throw new FeedError('parse_error');
  let data: ReturnType<typeof ical.sync.parseICS>;
  try { data = ical.sync.parseICS(body); } catch { throw new FeedError('parse_error'); }
  const events = new Map<string, ParsedOccurrence>();
  for (const component of Object.values(data)) {
    if (!component || component.type !== 'VEVENT') continue;
    const event = component as VEvent;
    if (event.status === 'CANCELLED' || typeof event.uid !== 'string') continue;
    let instances: ReturnType<typeof ical.expandRecurringEvent>;
    // One malformed event must not discard the rest of the feed.
    try { instances = ical.expandRecurringEvent(event, { from: window.from, to: window.to, expandOngoing: true }); }
    catch { continue; }
    for (const instance of instances) {
      if (instance.event?.status === 'CANCELLED' || !valid(instance.start)) continue;
      const allDay = instance.isFullDay;
      const start = allDay ? dateOnly(instance.start) : instance.start.toISOString();
      let end = valid(instance.end) ? (allDay ? dateOnly(instance.end) : instance.end.toISOString()) : start;
      if (allDay && end <= start) end = new Date(Date.parse(start) + DAY).toISOString();
      if (end < start) end = start;
      // A moved occurrence keeps the identity of the slot it replaces (its RECURRENCE-ID).
      const recurrenceId = (instance.event as { recurrenceid?: unknown }).recurrenceid;
      const occurrence = instance.isOverride && valid(recurrenceId) ? recurrenceId.toISOString() : instance.start.toISOString();
      const id = createHash('sha256').update(`${feedId}\n${event.uid}\n${occurrence}`).digest('hex').slice(0, 32);
      events.set(id, { event: { id, feedId, title: cleanTitle(instance.summary), start, end, allDay }, recurring: instance.isRecurring || instance.isOverride });
    }
  }
  return [...events.values()].sort((a, b) => a.event.start.localeCompare(b.event.start) || a.event.id.localeCompare(b.event.id)).slice(0, maxEvents);
}
