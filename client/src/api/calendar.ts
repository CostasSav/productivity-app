import { api } from './index';
import type { CalendarEvent, CalendarEventsResponse, CalendarFeedInfo } from '../types';

/** `unavailable`: the calendar API is missing or broken (e.g. the client deployed before the server). */
export type CalendarData = CalendarEventsResponse & { unavailable?: boolean };

export const CALENDAR_UNAVAILABLE: CalendarData = { enabled: false, feeds: [], events: [], unavailable: true };

const isFeed = (f: unknown): f is CalendarFeedInfo => {
  const v = f as CalendarFeedInfo;
  return !!v && typeof v.id === 'string' && typeof v.label === 'string' && typeof v.color === 'string' && typeof v.status === 'string';
};
const isEvent = (e: unknown): e is CalendarEvent => {
  const v = e as CalendarEvent;
  return !!v && typeof v.id === 'string' && typeof v.feedId === 'string' && typeof v.title === 'string'
    && typeof v.start === 'string' && typeof v.end === 'string' && typeof v.allDay === 'boolean';
};

/**
 * Calendars are optional: a 404, network failure or unexpected body (old server, SPA fallback)
 * resolves to "unavailable" instead of throwing, so there is no error state and no retry.
 * Only aborts (sign-out / session change) still reject.
 */
export async function fetchCalendarEvents(from: string, to: string): Promise<CalendarData> {
  let value: unknown;
  try { value = await api.calendar.events(from, to); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return CALENDAR_UNAVAILABLE;
  }
  const body = value as Partial<CalendarEventsResponse> | null;
  if (!body || typeof body.enabled !== 'boolean' || !Array.isArray(body.feeds) || !Array.isArray(body.events)) return CALENDAR_UNAVAILABLE;
  if (!body.enabled) return { enabled: false, feeds: [], events: [] };
  return { enabled: true, feeds: body.feeds.filter(isFeed), events: body.events.filter(isEvent) };
}
