import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import type { CalendarFeed } from './config';
import { fetchFeed, parseFeed, syncWindow, FeedError, type CalendarEvent, type FeedStatus, type FetchOptions } from './sync';

export interface FeedState { lastSuccessAt: string | null; status: FeedStatus; events: CalendarEvent[] }
export interface CalendarSnapshot {
  enabled: boolean;
  feeds: { id: string; label: string; color: string; lastSuccessAt: string | null; status: FeedStatus }[];
  events: CalendarEvent[];
}
export interface CalendarServiceOptions extends FetchOptions {
  // Directory holding only events.json; null keeps events in memory only.
  cacheDir: string | null;
  now?: () => Date;
  log?: (message: string) => void;
}

export const REFRESH_INTERVAL_MS = 10 * 60000;
export const MANUAL_REFRESH_INTERVAL_MS = 60000;
const CACHE_FILE = 'events.json';
const STATUSES: FeedStatus[] = ['pending', 'ok', 'timeout', 'http_error', 'parse_error', 'disabled'];

// The cache must never share a location with the productivity database or the session store.
export function calendarCacheDir(dataDir: string, sessionDir: string): string | null {
  const cacheDir = path.resolve(dataDir, 'calendar-cache');
  const sessions = path.resolve(sessionDir);
  const inside = (child: string, parent: string) => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
  return inside(cacheDir, sessions) || inside(sessions, cacheDir) ? null : cacheDir;
}

const isEvent = (value: unknown, feedId: string): value is CalendarEvent => {
  const e = value as CalendarEvent;
  return !!e && typeof e === 'object' && typeof e.id === 'string' && e.feedId === feedId && typeof e.title === 'string'
    && typeof e.start === 'string' && typeof e.end === 'string' && typeof e.allDay === 'boolean'
    && Number.isFinite(Date.parse(e.start)) && Number.isFinite(Date.parse(e.end));
};

export class CalendarService {
  readonly enabled: boolean;
  private readonly states = new Map<string, FeedState>();
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastManualAt = -Infinity;
  private readonly now: () => Date;
  private readonly log: (message: string) => void;

  constructor(private readonly feeds: CalendarFeed[] | null, private readonly options: CalendarServiceOptions) {
    this.enabled = !!feeds?.length;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? console.error;
    for (const feed of feeds ?? []) this.states.set(feed.id, { lastSuccessAt: null, status: 'pending', events: [] });
  }

  // Loads last good events so they show before the first refresh. Unknown feed ids are dropped.
  loadCache(): void {
    if (!this.enabled || !this.options.cacheDir) return;
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(path.join(this.options.cacheDir, CACHE_FILE), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') this.log('[calendar] cache unreadable; starting without cached events');
      return;
    }
    const stored = (parsed as { version?: unknown; feeds?: Record<string, Partial<FeedState>> })?.feeds;
    if ((parsed as { version?: unknown })?.version !== 1 || !stored || typeof stored !== 'object') {
      this.log('[calendar] cache format invalid; starting without cached events');
      return;
    }
    for (const [id, state] of this.states) {
      const entry = stored[id];
      if (!entry || typeof entry !== 'object') continue;
      state.events = Array.isArray(entry.events) ? entry.events.filter(event => isEvent(event, id)) : [];
      state.lastSuccessAt = typeof entry.lastSuccessAt === 'string' && Number.isFinite(Date.parse(entry.lastSuccessAt)) ? entry.lastSuccessAt : null;
      state.status = STATUSES.includes(entry.status as FeedStatus) ? entry.status as FeedStatus : 'pending';
    }
  }

  // Overlapping calls share the run in progress.
  refresh(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.running ??= this.runRefresh().finally(() => { this.running = null; });
    return this.running;
  }

  // Returns null when rate-limited (one manual refresh per minute).
  manualRefresh(): Promise<void> | null {
    const at = this.now().getTime();
    if (at - this.lastManualAt < MANUAL_REFRESH_INTERVAL_MS) return null;
    this.lastManualAt = at;
    return this.refresh();
  }

  retryAfterSeconds(): number {
    return Math.max(1, Math.ceil((this.lastManualAt + MANUAL_REFRESH_INTERVAL_MS - this.now().getTime()) / 1000));
  }

  // First refresh is non-blocking; the timer never keeps the process alive.
  start(intervalMs = REFRESH_INTERVAL_MS): void {
    if (!this.enabled || this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  snapshot(from?: Date, to?: Date): CalendarSnapshot {
    const feeds = (this.feeds ?? []).map(feed => {
      const state = this.states.get(feed.id)!;
      return { id: feed.id, label: feed.label, color: feed.color, lastSuccessAt: state.lastSuccessAt, status: state.status };
    });
    const start = from?.getTime() ?? -Infinity, end = to?.getTime() ?? Infinity;
    const events = [...this.states.values()].flatMap(state => state.events).filter(event => {
      const s = Date.parse(event.start), e = Date.parse(event.end);
      return s < end && (e > start || (e === s && s >= start));
    }).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    return { enabled: this.enabled, feeds, events };
  }

  private async runRefresh(): Promise<void> {
    const window = syncWindow(this.now());
    await Promise.all((this.feeds ?? []).map(async feed => {
      const state = this.states.get(feed.id)!;
      try {
        const body = await fetchFeed(feed.url, this.options);
        state.events = parseFeed(body, feed.id, window);
        state.lastSuccessAt = this.now().toISOString();
        state.status = 'ok';
      } catch (error) {
        // Keep the last good events; record only a sanitized code.
        state.status = error instanceof FeedError ? error.status : 'parse_error';
        this.log(`[calendar] feed ${feed.id} refresh failed: ${state.status}`);
      }
    }));
    this.writeCache();
  }

  private writeCache(): void {
    const dir = this.options.cacheDir;
    if (!dir) return;
    const feeds: Record<string, FeedState> = {};
    for (const [id, state] of this.states) feeds[id] = state;
    const temp = path.join(dir, `.events-${randomUUID()}.tmp`);
    let fd: number | null = null;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      fd = openSync(temp, 'wx', 0o600);
      writeSync(fd, JSON.stringify({ version: 1, feeds }));
      fsyncSync(fd);
      closeSync(fd);
      fd = null;
      renameSync(temp, path.join(dir, CACHE_FILE));
    } catch (error) {
      if (fd !== null) try { closeSync(fd); } catch { /* reported below */ }
      try { unlinkSync(temp); } catch { /* temp may not exist */ }
      const code = (error as NodeJS.ErrnoException)?.code;
      this.log(`[calendar] cache write failed${typeof code === 'string' && /^E[A-Z]+$/.test(code) ? `: ${code}` : ''}`);
    }
  }
}
