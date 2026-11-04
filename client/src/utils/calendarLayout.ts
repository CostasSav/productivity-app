// Pure logic for the Week/Day calendar: no React, no DOM. All times are the browser's local time zone.
import { dateKey, offsetDay, parseDateKey } from './date';
import type { CalendarEvent, CalendarFeedInfo } from '../types';

export const DAY_MINUTES = 24 * 60;
export const MIN_EVENT_MINUTES = 15;
export const STALE_AFTER_MS = 30 * 60000;

// ── Range ─────────────────────────────────────────────────────────────────────

/** The server's from/to are UTC days: pad one day each side so every local-day event is included. */
export function paddedRange(first: string, last: string): { from: string; to: string } {
  return { from: offsetDay(first, -1), to: offsetDay(last, 1) };
}

/** [local midnight, next local midnight) in ms — 23 h or 25 h on DST days. */
export function dayBounds(day: string): [number, number] {
  return [parseDateKey(day).getTime(), parseDateKey(offsetDay(day, 1)).getTime()];
}

/** Local interval of an event. All-day events are calendar dates, sent by the server as UTC midnights. */
export function eventInterval(event: CalendarEvent): [number, number] {
  if (event.allDay) {
    const start = parseDateKey(event.start.slice(0, 10)).getTime();
    const end = parseDateKey(event.end.slice(0, 10)).getTime();
    return [start, Math.max(end, start)];
  }
  const start = Date.parse(event.start);
  return [start, Math.max(Date.parse(event.end), start)];
}

/** Half-open overlap; a zero-length event counts when it starts inside the range. */
function overlaps([s, e]: [number, number], [from, to]: [number, number]): boolean {
  return s < to && (e > from || (e === s && s >= from));
}

/** Events overlapping the visible local days [first, last]. */
export function filterEventsForRange(events: CalendarEvent[], first: string, last: string): CalendarEvent[] {
  const range: [number, number] = [dayBounds(first)[0], dayBounds(last)[1]];
  return events.filter(event => overlaps(eventInterval(event), range));
}

// ── Splitting at midnight ─────────────────────────────────────────────────────

export interface DaySegment {
  event: CalendarEvent;
  day: string;
  /** Wall-clock minutes from local midnight, 0–1440. */
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

const wallMinutes = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };

/**
 * Timed events cut into one segment per visible day they touch. Positions use wall-clock time,
 * so on DST days 09:00 still sits on the 09:00 line.
 */
export function splitTimedEvents(events: CalendarEvent[], days: string[]): DaySegment[] {
  const segments: DaySegment[] = [];
  for (const event of events) {
    if (event.allDay) continue;
    const [s, e] = eventInterval(event);
    for (const day of days) {
      const [dayStart, dayEnd] = dayBounds(day);
      if (!overlaps([s, e], [dayStart, dayEnd])) continue;
      const startMin = s <= dayStart ? 0 : wallMinutes(s);
      let endMin = e >= dayEnd ? DAY_MINUTES : wallMinutes(e);
      // Repeated hour when clocks go back: keep the real duration.
      if (endMin < startMin) endMin = Math.min(DAY_MINUTES, startMin + (Math.min(e, dayEnd) - Math.max(s, dayStart)) / 60000);
      segments.push({ event, day, startMin, endMin, continuesBefore: s < dayStart, continuesAfter: e > dayEnd });
    }
  }
  return segments;
}

/** All-day events covering a given local day. */
export function allDayEventsFor(events: CalendarEvent[], day: string): CalendarEvent[] {
  const bounds = dayBounds(day);
  return events.filter(event => event.allDay && overlaps(eventInterval(event), bounds));
}

/** Visible extent: at least 15 minutes tall, kept inside the day. */
export function visualExtent(segment: Pick<DaySegment, 'startMin' | 'endMin'>): [number, number] {
  const start = Math.min(segment.startMin, DAY_MINUTES - MIN_EVENT_MINUTES);
  return [start, Math.min(DAY_MINUTES, Math.max(segment.endMin, start + MIN_EVENT_MINUTES))];
}

// ── Column packing ────────────────────────────────────────────────────────────

export interface PlacedSegment extends DaySegment { top: number; bottom: number; column: number; columns: number }

/**
 * Side-by-side layout for one day: overlapping segments form a cluster; each takes the first
 * free column, and every segment in a cluster shares the cluster's column count.
 */
export function packColumns(segments: DaySegment[]): PlacedSegment[] {
  const sorted = segments
    .map(segment => { const [top, bottom] = visualExtent(segment); return { ...segment, top, bottom, column: 0, columns: 1 }; })
    .sort((a, b) => a.top - b.top || (b.bottom - b.top) - (a.bottom - a.top) || a.event.id.localeCompare(b.event.id));
  let cluster: PlacedSegment[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => { for (const placed of cluster) placed.columns = columnEnds.length; cluster = []; columnEnds = []; };
  for (const placed of sorted) {
    if (cluster.length && placed.top >= clusterEnd) { close(); clusterEnd = -Infinity; }
    let column = columnEnds.findIndex(end => end <= placed.top);
    if (column === -1) { column = columnEnds.length; columnEnds.push(placed.bottom); }
    else columnEnds[column] = placed.bottom;
    placed.column = column;
    cluster.push(placed);
    clusterEnd = Math.max(clusterEnd, placed.bottom);
  }
  close();
  return sorted;
}

// ── Conflicts ─────────────────────────────────────────────────────────────────

/**
 * Ids of timed events that overlap an event from a different feed (double-booking).
 * Same-feed overlaps and all-day events are not conflicts.
 */
export function findConflicts(events: CalendarEvent[]): Set<string> {
  const timed = events.filter(e => !e.allDay).map(event => ({ event, interval: eventInterval(event) }))
    .sort((a, b) => a.interval[0] - b.interval[0]);
  const conflicts = new Set<string>();
  let active: typeof timed = [];
  for (const current of timed) {
    const [start, end] = current.interval;
    active = active.filter(other => other.interval[1] > start);
    if (end > start) {
      for (const other of active) {
        if (other.event.feedId !== current.event.feedId) { conflicts.add(other.event.id); conflicts.add(current.event.id); }
      }
      active.push(current);
    }
  }
  return conflicts;
}

/** Events from other feeds overlapping this one, for the popover. */
export function conflictsWith(event: CalendarEvent, events: CalendarEvent[]): CalendarEvent[] {
  if (event.allDay) return [];
  const [s, e] = eventInterval(event);
  return events.filter(other => {
    if (other.allDay || other.feedId === event.feedId) return false;
    const [os, oe] = eventInterval(other);
    return os < e && oe > s;
  });
}

// ── Formatting & freshness ────────────────────────────────────────────────────

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "10:00–11:00", "All day", or with dates when the event spans days. */
export function formatEventRange(event: CalendarEvent): string {
  const [s, e] = eventInterval(event);
  if (event.allDay) {
    const lastDay = offsetDay(dateKey(new Date(e)), -1);
    const first = dateKey(new Date(s));
    if (lastDay <= first) return 'All day';
    const fmt = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `All day, ${fmt(first)}–${fmt(lastDay)}`;
  }
  if (dateKey(new Date(s)) === dateKey(new Date(Math.max(s, e - 1)))) return `${formatTime(s)}–${formatTime(e)}`;
  const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day(s)} ${formatTime(s)} – ${day(e)} ${formatTime(e)}`;
}

/** Compact range as seen from one day: "22:00–01:00 (+1)", "…–02:00" when it began earlier. */
export function formatDayRange(event: CalendarEvent, day: string): string {
  if (event.allDay) return 'All day';
  const [s, e] = eventInterval(event);
  const [dayStart] = dayBounds(day);
  const start = s < dayStart ? '…' : formatTime(s);
  const endDay = dateKey(new Date(Math.max(s, e - 1)));
  const extraDays = Math.round((parseDateKey(endDay).getTime() - parseDateKey(day).getTime()) / 86400000);
  return `${start}–${formatTime(e)}${extraDays > 0 ? ` (+${extraDays})` : ''}`;
}

export function relativeAge(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Null when the feed is healthy; otherwise a short warning for its legend chip. */
export function feedWarning(feed: Pick<CalendarFeedInfo, 'status' | 'lastSuccessAt'>, now: number): string | null {
  const last = feed.lastSuccessAt ? Date.parse(feed.lastSuccessAt) : NaN;
  const age = now - last;
  if (feed.status === 'ok' && Number.isFinite(last) && age <= STALE_AFTER_MS) return null;
  if (!Number.isFinite(last)) return feed.status === 'pending' ? 'not synced yet' : 'sync failed';
  return `updated ${relativeAge(age)}`;
}

/** Message for a failed manual refresh: 429 and 409 are expected, quiet outcomes. */
export function refreshErrorMessage(status: number | undefined): string {
  if (status === 429) return 'Already refreshed';
  if (status === 409) return 'No calendars configured';
  return 'Refresh failed';
}
