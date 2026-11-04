import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { parseCalendarFeeds, readCalendarConfig, CalendarConfigError } from '../src/calendar/config';
import { fetchFeed, parseFeed, syncWindow, FeedError, type CalendarEvent } from '../src/calendar/sync';
import { CalendarService, calendarCacheDir } from '../src/calendar/service';
import { createCalendarRouter } from '../src/calendar/router';

// Synthetic fixtures and placeholder URLs only. The marker lets tests prove URLs never leak.
const SECRET = 'SYNTHETIC-SECRET-TOKEN';
const outlookUrl = `https://outlook.office365.com/owa/calendar/${SECRET}/synthetic/calendar.ics`;
const googleUrl = `https://calendar.google.com/calendar/ical/synthetic%40example.invalid/private-${SECRET}/basic.ics`;
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures/calendar', name), 'utf8');
const outlook = fixture('outlook.ics'), google = fixture('google.ics');
const feedsEnv = JSON.stringify([
  { id: 'work', label: 'Work', color: '#1F6FEB', url: outlookUrl },
  { id: 'personal', label: 'Personal', color: '#2da44e', url: googleUrl },
]);
const feeds = () => parseCalendarFeeds(feedsEnv)!;
const starts = (events: CalendarEvent[], title: string) => events.filter(e => e.title === title).map(e => e.start);

type Handler = (init: RequestInit) => Response | Promise<Response>;
function fakeFetch(routes: Record<string, Handler>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push(url);
    const handler = routes[url];
    if (!handler) throw new TypeError(`fetch failed for ${url}`);
    return handler(init);
  }) as typeof fetch;
  return { impl, calls };
}
const ics = (body: string): Handler => () => new Response(body, { headers: { 'Content-Type': 'text/calendar' } });

function tempDir(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'workspace-calendar-tests-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('workspace-calendar-tests-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

// ── Configuration ─────────────────────────────────────────────────────────────

test('absent or empty CALENDAR_FEEDS disables the feature', () => {
  assert.equal(parseCalendarFeeds(undefined), null);
  assert.equal(parseCalendarFeeds(''), null);
  assert.equal(parseCalendarFeeds('[]'), null);
  assert.equal(readCalendarConfig({}, () => assert.fail('must not log')), null);
});

test('valid config parses, normalizes and hides the URL from serialization', () => {
  const [work, personal] = feeds();
  assert.deepEqual({ ...work }, { id: 'work', label: 'Work', color: '#1f6feb' });
  assert.equal(work.url, outlookUrl);
  assert.equal(personal.url, googleUrl);
  assert.ok(!JSON.stringify(feeds()).includes(SECRET));
  assert.ok(!require('node:util').inspect(feeds()).includes(SECRET));
  assert.equal(parseCalendarFeeds(JSON.stringify([{ id: 'x', label: 'X', color: '#000000', url: 'https://outlook.office.com/owa/calendar/a/b/calendar.ics' }]))!.length, 1);
});

test('config validation rejects bad shape, ids, colors and limits', () => {
  const entry = { id: 'work', label: 'Work', color: '#123456', url: outlookUrl };
  const cases: [unknown, string][] = [
    ['not json', 'not_json'],
    [{ id: 'work' }, 'not_array'],
    [[null], 'feed_1_not_object'],
    [[{ ...entry, id: 'Work' }], 'feed_1_invalid_id'],
    [[{ ...entry, id: 'work_1' }], 'feed_1_invalid_id'],
    [[{ ...entry, id: '-work' }], 'feed_1_invalid_id'],
    [[entry, { ...entry }], 'feed_2_duplicate_id'],
    [[{ ...entry, label: ' ' }], 'feed_1_invalid_label'],
    [[{ ...entry, color: 'red' }], 'feed_1_invalid_color'],
    [[{ ...entry, color: '#12345' }], 'feed_1_invalid_color'],
    [[{ ...entry, color: '#1234567' }], 'feed_1_invalid_color'],
    [Array.from({ length: 6 }, (_, i) => ({ ...entry, id: `f${i}` })), 'too_many_feeds'],
  ];
  for (const [value, code] of cases) {
    assert.throws(() => parseCalendarFeeds(typeof value === 'string' ? value : JSON.stringify(value)),
      (error: unknown) => error instanceof CalendarConfigError && error.code === code, code);
  }
  assert.equal(parseCalendarFeeds(JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ ...entry, id: `f${i}` }))))!.length, 5);
});

test('host allowlist accepts only exact HTTPS Outlook/Google hosts', () => {
  const rejected = [
    `http://outlook.office365.com/owa/calendar/${SECRET}/calendar.ics`,
    `webcal://outlook.office365.com/owa/calendar/${SECRET}/calendar.ics`,
    `https://outlook.office365.com.attacker.example/${SECRET}`,
    `https://attacker.example/outlook.office365.com/${SECRET}`,
    `https://sub.calendar.google.com/${SECRET}`,
    `https://google.com/calendar/${SECRET}`,
    `https://calendar.google.com:8443/${SECRET}`,
    `https://user:${SECRET}@calendar.google.com/x.ics`,
    'not a url',
  ];
  for (const url of rejected) {
    const logs: string[] = [];
    const config = readCalendarConfig({ CALENDAR_FEEDS: JSON.stringify([{ id: 'a', label: 'A', color: '#000000', url }]) }, m => logs.push(m));
    assert.equal(config, null, url);
    assert.deepEqual(logs, ['[calendar] CALENDAR_FEEDS invalid: feed_1_invalid_url; calendar disabled']);
  }
  const upper = parseCalendarFeeds(JSON.stringify([{ id: 'a', label: 'A', color: '#000000', url: 'https://CALENDAR.GOOGLE.COM/x.ics' }]));
  assert.equal(upper!.length, 1);
});

test('invalid config logs only a sanitized code, never the URL or raw JSON', () => {
  const logs: string[] = [];
  const raw = JSON.stringify([{ id: 'BAD', label: 'x', color: '#000000', url: outlookUrl }]);
  assert.equal(readCalendarConfig({ CALENDAR_FEEDS: raw }, m => logs.push(m)), null);
  assert.equal(readCalendarConfig({ CALENDAR_FEEDS: raw.slice(0, -3) }, m => logs.push(m)), null);
  assert.equal(logs.length, 2);
  for (const message of logs) assert.ok(!message.includes(SECRET) && !message.includes('office365'), message);
});

// ── Parsing ───────────────────────────────────────────────────────────────────

test('Outlook feed: Windows TZID, spring DST, moved/EXDATE/cancelled occurrences, untitled fallback', () => {
  const events = parseFeed(outlook, 'work', syncWindow(new Date('2026-03-20T10:00:00Z')));
  // 09:00 Romance Standard Time = 08:00Z in winter, 07:00Z after 2026-03-29.
  assert.deepEqual(starts(events, 'Synthetic weekly sync'), [
    '2026-03-09T08:00:00.000Z', '2026-03-16T08:00:00.000Z', '2026-03-23T08:00:00.000Z', '2026-03-30T07:00:00.000Z',
    // 04-06 moved (below), 04-13 EXDATE, 04-20 STATUS:CANCELLED override.
    '2026-04-27T07:00:00.000Z', '2026-05-04T07:00:00.000Z', '2026-05-11T07:00:00.000Z',
  ]);
  const moved = events.filter(e => e.title === 'Synthetic weekly sync (moved)');
  assert.deepEqual(moved.map(e => [e.start, e.end]), [['2026-04-07T12:00:00.000Z', '2026-04-07T12:30:00.000Z']]);
  assert.equal(events.find(e => e.start === '2026-03-23T08:00:00.000Z')!.end, '2026-03-23T08:30:00.000Z');
  assert.equal(events.some(e => e.title.includes('cancelled')), false);
  assert.deepEqual(events.filter(e => e.title === 'Busy').map(e => e.start), ['2026-03-26T14:00:00.000Z']);
  // Window starts 2026-03-06: the 03-02 occurrence is excluded.
  assert.equal(events.some(e => e.start.startsWith('2026-03-02')), false);
  assert.equal(new Set(events.map(e => e.id)).size, events.length);
  assert.deepEqual(parseFeed(outlook, 'work', syncWindow(new Date('2026-03-20T10:00:00Z'))).map(e => e.id), events.map(e => e.id));
  assert.ok(events.every(e => e.feedId === 'work' && e.allDay === false));
});

test('Google feed: Europe/Paris across autumn DST, all-day and UTC events', () => {
  const events = parseFeed(google, 'personal', syncWindow(new Date('2026-10-15T10:00:00Z')));
  // 18:00 Paris = 16:00Z in summer time, 17:00Z after 2026-10-25.
  assert.deepEqual(starts(events, 'Synthetic evening class'), [
    '2026-10-08T16:00:00.000Z', '2026-10-15T16:00:00.000Z', '2026-10-22T16:00:00.000Z',
    '2026-10-29T17:00:00.000Z', '2026-11-05T17:00:00.000Z', '2026-11-12T17:00:00.000Z',
  ]);
  const holiday = events.find(e => e.title === 'Synthetic two-day holiday')!;
  assert.deepEqual({ start: holiday.start, end: holiday.end, allDay: holiday.allDay },
    { start: '2026-10-20T00:00:00.000Z', end: '2026-10-22T00:00:00.000Z', allDay: true });
  const call = events.find(e => e.title === 'Synthetic UTC call')!;
  assert.deepEqual([call.start, call.end, call.allDay], ['2026-11-03T09:30:00.000Z', '2026-11-03T10:00:00.000Z', false]);
});

test('parsed output keeps only id/feedId/title/start/end/allDay — no description, attendees or URLs', () => {
  const events = [...parseFeed(outlook, 'work', syncWindow(new Date('2026-03-20T10:00:00Z'))),
    ...parseFeed(google, 'personal', syncWindow(new Date('2026-10-15T10:00:00Z')))];
  assert.ok(events.length > 10);
  for (const event of events) assert.deepEqual(Object.keys(event).sort(), ['allDay', 'end', 'feedId', 'id', 'start', 'title']);
  const json = JSON.stringify(events);
  for (const forbidden of ['SECRET-DESCRIPTION', 'SECRET-LOCATION', 'mailto', 'attendee', 'organizer', 'example.invalid', 'http', 'teams', 'meet.']) {
    assert.ok(!json.toLowerCase().includes(forbidden.toLowerCase()), forbidden);
  }
});

test('non-calendar or broken bodies are parse errors', () => {
  const window = syncWindow(new Date('2026-03-20T00:00:00Z'));
  for (const body of ['', '<html>login</html>', '{"events":[]}']) {
    assert.throws(() => parseFeed(body, 'work', window), (e: unknown) => e instanceof FeedError && e.status === 'parse_error');
  }
});

test('sync window is today −14 to today +90 days (UTC)', () => {
  const { from, to } = syncWindow(new Date('2026-11-04T23:30:00Z'));
  assert.equal(from.toISOString(), '2026-10-21T00:00:00.000Z');
  assert.equal(to.toISOString(), '2027-02-02T23:59:59.999Z');
});

// ── Fetching ──────────────────────────────────────────────────────────────────

test('fetch follows redirects only while the host stays on the allowlist', async () => {
  const hop = 'https://outlook.office.com/owa/calendar/synthetic/hop.ics';
  const ok = fakeFetch({
    [outlookUrl]: () => new Response(null, { status: 302, headers: { Location: hop } }),
    [hop]: ics(outlook),
  });
  assert.equal(await fetchFeed(outlookUrl, { fetchImpl: ok.impl }), outlook);
  assert.deepEqual(ok.calls, [outlookUrl, hop]);

  const offsite = `https://attacker.example/${SECRET}`;
  const bad = fakeFetch({ [outlookUrl]: () => new Response(null, { status: 301, headers: { Location: offsite } }), [offsite]: ics(outlook) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: bad.impl }), (e: unknown) => e instanceof FeedError && e.status === 'http_error');
  assert.deepEqual(bad.calls, [outlookUrl]);

  const downgrade = fakeFetch({ [outlookUrl]: () => new Response(null, { status: 302, headers: { Location: outlookUrl.replace('https', 'http') } }) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: downgrade.impl }), FeedError);
  assert.equal(downgrade.calls.length, 1);

  const loop = fakeFetch({ [outlookUrl]: () => new Response(null, { status: 302, headers: { Location: outlookUrl } }) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: loop.impl }), FeedError);
  assert.equal(loop.calls.length, 6);
});

test('fetch enforces size cap, HTTP status and timeout', async () => {
  const declared = fakeFetch({ [outlookUrl]: () => new Response('BEGIN:VCALENDAR', { headers: { 'Content-Length': String(6 * 1024 * 1024) } }) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: declared.impl }), (e: unknown) => e instanceof FeedError && e.status === 'http_error');

  const chunk = new Uint8Array(64 * 1024).fill(65);
  let sent = 0;
  const streamed = fakeFetch({ [outlookUrl]: () => new Response(new ReadableStream({ pull(controller) { sent += chunk.length; controller.enqueue(chunk); } })) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: streamed.impl, maxBytes: 256 * 1024 }), (e: unknown) => e instanceof FeedError && e.status === 'http_error');
  assert.ok(sent < 1024 * 1024, 'stream cancelled soon after the cap');

  for (const status of [401, 404, 500]) {
    const failed = fakeFetch({ [outlookUrl]: () => new Response('nope', { status }) });
    await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: failed.impl }), (e: unknown) => e instanceof FeedError && e.status === 'http_error');
  }

  const hang = fakeFetch({ [outlookUrl]: init => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))) });
  await assert.rejects(fetchFeed(outlookUrl, { fetchImpl: hang.impl, timeoutMs: 30 }), (e: unknown) => e instanceof FeedError && e.status === 'timeout');
});

test('fetch errors never carry the feed URL', async () => {
  const broken = fakeFetch({}); // throws TypeError mentioning the URL
  const error = await fetchFeed(outlookUrl, { fetchImpl: broken.impl }).catch(e => e);
  assert.ok(error instanceof FeedError);
  assert.ok(!String(error.message).includes(SECRET) && !String(error.stack).includes(SECRET));
  assert.equal(error.cause, undefined);
});

// ── Service, cache and refresh ────────────────────────────────────────────────

test('refresh stores events in an atomic cache file, and a failed refresh keeps last good data', async t => {
  const directory = tempDir(t);
  const cacheDir = path.join(directory, 'calendar-cache');
  const logs: string[] = [];
  let now = new Date('2026-10-15T10:00:00Z');
  let healthy = true;
  const fake = fakeFetch({
    [outlookUrl]: () => healthy ? ics(outlook)({}) : new Response('down', { status: 503 }),
    [googleUrl]: () => healthy ? ics(google)({}) : new Response('<html>not a calendar</html>'),
  });
  const service = new CalendarService(feeds(), { cacheDir, fetchImpl: fake.impl, now: () => now, log: m => logs.push(m) });
  assert.deepEqual(service.snapshot().feeds.map(f => f.status), ['pending', 'pending']);

  await service.refresh();
  const good = service.snapshot();
  assert.deepEqual(good.feeds, [
    { id: 'work', label: 'Work', color: '#1f6feb', lastSuccessAt: '2026-10-15T10:00:00.000Z', status: 'ok' },
    { id: 'personal', label: 'Personal', color: '#2da44e', lastSuccessAt: '2026-10-15T10:00:00.000Z', status: 'ok' },
  ]);
  assert.ok(good.events.some(e => e.feedId === 'personal'));
  assert.deepEqual(readdirSync(directory), ['calendar-cache']);
  assert.deepEqual(readdirSync(cacheDir), ['events.json']);

  healthy = false;
  now = new Date('2026-10-15T10:10:00Z');
  await service.refresh();
  const after = service.snapshot();
  assert.deepEqual(after.events, good.events);
  assert.deepEqual(after.feeds.map(f => [f.status, f.lastSuccessAt]),
    [['http_error', '2026-10-15T10:00:00.000Z'], ['parse_error', '2026-10-15T10:00:00.000Z']]);
  assert.deepEqual(logs, ['[calendar] feed work refresh failed: http_error', '[calendar] feed personal refresh failed: parse_error']);
  assert.deepEqual(readdirSync(cacheDir), ['events.json']);

  const cache = readFileSync(path.join(cacheDir, 'events.json'), 'utf8');
  for (const forbidden of [SECRET, 'office365', 'calendar.google.com', 'SECRET-DESCRIPTION', 'BEGIN:VCALENDAR', 'mailto']) assert.ok(!cache.includes(forbidden), forbidden);

  // A restarted process shows cached events before its first refresh.
  const restarted = new CalendarService(feeds(), { cacheDir, fetchImpl: fakeFetch({}).impl, now: () => now, log: m => logs.push(m) });
  restarted.loadCache();
  assert.deepEqual(restarted.snapshot(), after);
});

test('feed URLs never appear in logs, errors or snapshots', async t => {
  const logs: string[] = [];
  const fake = fakeFetch({}); // every request throws an error mentioning its URL
  const service = new CalendarService(feeds(), { cacheDir: path.join(tempDir(t), 'calendar-cache'), fetchImpl: fake.impl, log: m => logs.push(m) });
  await service.refresh();
  assert.equal(fake.calls.length, 2);
  assert.ok(logs.length >= 2);
  const everything = JSON.stringify([logs, service.snapshot()]);
  assert.ok(!everything.includes(SECRET) && !everything.includes('office365') && !everything.includes('calendar.google.com'));
});

test('overlapping refreshes share one run; manual refresh limited to once per minute', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fake = fakeFetch({ [outlookUrl]: async () => { await gate; return ics(outlook)({}); }, [googleUrl]: ics(google) });
  let now = new Date('2026-10-15T10:00:00Z');
  const service = new CalendarService(feeds(), { cacheDir: null, fetchImpl: fake.impl, now: () => now, log: () => undefined });
  const first = service.refresh(), second = service.refresh();
  assert.equal(first, second);
  release();
  await first;
  assert.equal(fake.calls.length, 2);

  const manual = service.manualRefresh();
  assert.ok(manual);
  await manual;
  now = new Date('2026-10-15T10:00:59Z');
  assert.equal(service.manualRefresh(), null);
  assert.equal(service.retryAfterSeconds(), 1);
  now = new Date('2026-10-15T10:01:00Z');
  await service.manualRefresh();
  assert.equal(fake.calls.length, 6);
});

test('corrupt or foreign cache is ignored without throwing', t => {
  const directory = tempDir(t);
  const logs: string[] = [];
  writeFileSync(path.join(directory, 'events.json'), '{ truncated');
  const service = new CalendarService(feeds(), { cacheDir: directory, log: m => logs.push(m) });
  service.loadCache();
  assert.deepEqual(service.snapshot().events, []);
  writeFileSync(path.join(directory, 'events.json'), JSON.stringify({ version: 1, feeds: {
    work: { status: 'ok', lastSuccessAt: '2026-10-15T10:00:00.000Z', events: [{ id: 'x', feedId: 'other', title: 't', start: 'bad', end: 'bad', allDay: false }] },
    removed: { status: 'ok', lastSuccessAt: null, events: [] },
  } }));
  service.loadCache();
  assert.deepEqual(service.snapshot().events, []);
  assert.deepEqual(logs, ['[calendar] cache unreadable; starting without cached events']);
});

test('disabled service performs no work', async () => {
  const fake = fakeFetch({});
  const service = new CalendarService(null, { cacheDir: null, fetchImpl: fake.impl, log: () => assert.fail('must not log') });
  service.loadCache();
  service.start();
  await service.refresh();
  assert.deepEqual(service.snapshot(), { enabled: false, feeds: [], events: [] });
  assert.equal(fake.calls.length, 0);
});

test('cache directory never overlaps the session store', () => {
  const data = path.join(tmpdir(), 'synthetic-data');
  assert.equal(calendarCacheDir(data, path.join(data, 'sessions')), path.join(data, 'calendar-cache'));
  assert.equal(calendarCacheDir(data, path.join(data, 'calendar-cache')), null);
  assert.equal(calendarCacheDir(data, path.join(data, 'calendar-cache', 'nested')), null);
  assert.equal(calendarCacheDir(data, data), null);
});

// ── API ───────────────────────────────────────────────────────────────────────

async function api(t: TestContext, service: CalendarService) {
  const app = express();
  app.use('/api/calendar', createCalendarRouter(service));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/calendar`;
  return (route: string, method = 'GET') => fetch(base + route, { method });
}

test('GET /events validates the range and returns overlapping events only', async t => {
  const fake = fakeFetch({ [outlookUrl]: ics(outlook), [googleUrl]: ics(google) });
  const service = new CalendarService(feeds(), { cacheDir: null, fetchImpl: fake.impl, now: () => new Date('2026-10-15T10:00:00Z'), log: () => undefined });
  await service.refresh();
  const call = await api(t, service);
  for (const query of ['', '?from=2026-10-01', '?from=2026-10-01&to=tomorrow', '?from=2026-02-30&to=2026-03-01',
    '?from=2026-10-10&to=2026-10-09', '?from=2026-10-01&to=2026-12-02', '?from=2026-10-01&to=2026-10-02&to=2026-10-03']) {
    const response = await call('/events' + query);
    assert.equal(response.status, 400, query);
    assert.ok(typeof (await response.json()).error === 'string');
  }
  assert.equal((await call('/events?from=2026-10-01&to=2026-12-01')).status, 200); // exactly 62 days

  const body = await (await call('/events?from=2026-10-21&to=2026-10-21')).json();
  assert.equal(body.enabled, true);
  assert.deepEqual(body.feeds.map((f: { id: string }) => f.id), ['work', 'personal']);
  assert.deepEqual(body.events.map((e: CalendarEvent) => e.title), ['Synthetic two-day holiday']);
  const next = await (await call('/events?from=2026-10-22&to=2026-10-22')).json();
  assert.deepEqual(next.events.map((e: CalendarEvent) => [e.title, e.start]), [['Synthetic evening class', '2026-10-22T16:00:00.000Z']]);
  assert.ok(!JSON.stringify(body).includes(SECRET));
});

test('disabled feature reports enabled:false; POST /refresh is rate limited', async t => {
  const disabled = await api(t, new CalendarService(null, { cacheDir: null }));
  assert.deepEqual(await (await disabled('/events?from=2026-10-01&to=2026-10-02')).json(), { enabled: false, feeds: [], events: [] });
  assert.equal((await disabled('/refresh', 'POST')).status, 409);

  const fake = fakeFetch({ [outlookUrl]: ics(outlook), [googleUrl]: ics(google) });
  const call = await api(t, new CalendarService(feeds(), { cacheDir: null, fetchImpl: fake.impl, log: () => undefined }));
  const first = await call('/refresh', 'POST');
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.deepEqual(Object.keys(body), ['enabled', 'feeds']);
  assert.ok(body.feeds.every((f: { status: string }) => f.status === 'ok'));
  const second = await call('/refresh', 'POST');
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get('retry-after')) > 0);
  assert.equal(fake.calls.length, 2);
});

test('calendar router is mounted under the authenticated /api boundary', () => {
  const index = readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');
  assert.match(index, /app\.use\('\/api\/calendar', createCalendarRouter\(calendar\)\);/);
  // Started after listen, not before: startup never waits on external calendars.
  assert.ok(index.indexOf('calendar.start()') > index.indexOf('app.listen('));
});
