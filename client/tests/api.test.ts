import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserAuth, clearSession, onSessionLost, ApiError } from '../src/api/request';
import { api } from '../src/api';

test('existing API operations use same-origin cookies and CSRF without bearer secrets', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  const calls: { url: string; options: RequestInit }[] = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/api/auth/')) return Response.json({ authenticated: true, csrfToken: 'synthetic-csrf' });
    return options.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ synthetic: true });
  };
  await browserAuth.session();
  await api.tasks.list(4);
  await api.tasks.create({ title: 'Synthetic task' });
  await api.notes.update(1, { content: 'Synthetic note' });
  await api.habits.reorder([2, 1]);
  await api.grocery.delete(1);
  await api.ai.summarize(1);
  assert.deepEqual(calls.slice(1).map(call => [call.url, call.options.method ?? 'GET']), [
    ['/api/tasks?section_id=4', 'GET'], ['/api/tasks', 'POST'], ['/api/notes/1', 'PUT'], ['/api/habits/reorder', 'PATCH'], ['/api/grocery/1', 'DELETE'], ['/api/ai/summarize', 'POST'],
  ]);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    const headers = new Headers(options.headers);
    assert.equal(headers.has('Authorization'), false);
    if (options.method) assert.equal(headers.get('X-CSRF-Token'), 'synthetic-csrf');
  }
  assert.deepEqual(JSON.parse(String(calls[2].options.body)), { title: 'Synthetic task' });
});

test('401 invalidates once, blocks new operations, and rejects late protected responses', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  let lost = 0;
  const unsubscribe = onSessionLost(() => lost++);
  t.after(unsubscribe);
  let release!: (response: Response) => void;
  globalThis.fetch = async url => String(url).includes('/auth/') ? Response.json({ authenticated: true, csrfToken: 'synthetic' }) : new Promise(resolve => { release = resolve; });
  await browserAuth.session();
  const stale = api.tasks.list();
  clearSession();
  release(Response.json([{ title: 'Must not return' }]));
  await assert.rejects(stale, { name: 'AbortError' });
  await assert.rejects(api.tasks.create({}), (error: unknown) => error instanceof ApiError && error.status === 401);
  await browserAuth.session();
  globalThis.fetch = async () => Response.json({ error: 'Unauthorized' }, { status: 401 });
  await assert.rejects(api.tasks.list(), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(lost, 2);
});

test('logout clears access; incorrect password does not trigger a login loop', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  let attempts = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/login')) { attempts++; return Response.json({ error: 'Unable to sign in' }, { status: 401 }); }
    if (String(url).endsWith('/logout')) return new Response(null, { status: 204 });
    return Response.json({ authenticated: true, csrfToken: 'synthetic' });
  };
  await assert.rejects(browserAuth.login('synthetic-invalid'));
  assert.equal(attempts, 1);
  await browserAuth.logout();
  await assert.rejects(api.notes.list(), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test('misconfigured HTML rewrites and invalid session responses fail closed', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  globalThis.fetch = async () => new Response('<html>Not the API</html>');
  await assert.rejects(browserAuth.session(), /Unexpected server response/);
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(browserAuth.session(), /authentication service/);
  await assert.rejects(api.tasks.list(), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test('calendar API: GET events by date range, POST refresh with CSRF, 429/409 surface as ApiError', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  const calls: { url: string; options: RequestInit }[] = [];
  let refreshStatus = 200;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/api/auth/')) return Response.json({ authenticated: true, csrfToken: 'synthetic-csrf' });
    if (String(url).endsWith('/refresh')) {
      return refreshStatus === 200 ? Response.json({ enabled: true, feeds: [] }) : Response.json({ error: 'synthetic' }, { status: refreshStatus });
    }
    return Response.json({ enabled: false, feeds: [], events: [] });
  };
  await browserAuth.session();
  assert.deepEqual(await api.calendar.events('2026-11-02', '2026-11-10'), { enabled: false, feeds: [], events: [] });
  await api.calendar.refresh();
  for (const status of [429, 409]) {
    refreshStatus = status;
    await assert.rejects(api.calendar.refresh(), (error: unknown) => error instanceof ApiError && error.status === status);
  }
  assert.deepEqual(calls.slice(1, 3).map(call => [call.url, call.options.method ?? 'GET']),
    [['/api/calendar/events?from=2026-11-02&to=2026-11-10', 'GET'], ['/api/calendar/refresh', 'POST']]);
  assert.equal(new Headers(calls[2].options.headers).get('X-CSRF-Token'), 'synthetic-csrf');
  assert.equal(calls[1].options.credentials, 'same-origin');
});

test('calendar API missing (deploy order): 404, network error or wrong body resolve to unavailable without retry', async t => {
  const { fetchCalendarEvents, CALENDAR_UNAVAILABLE } = await import('../src/api/calendar');
  const { QueryClient } = await import('@tanstack/react-query');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  let calendarCalls = 0;
  let respond: () => Response | Promise<Response> = () => new Response('<pre>Cannot GET /api/calendar/events</pre>', { status: 404, headers: { 'Content-Type': 'text/html' } });
  globalThis.fetch = async url => {
    if (String(url).includes('/api/auth/')) return Response.json({ authenticated: true, csrfToken: 'synthetic-csrf' });
    calendarCalls++;
    return respond();
  };
  await browserAuth.session();
  assert.deepEqual(await fetchCalendarEvents('2026-11-01', '2026-11-09'), CALENDAR_UNAVAILABLE);

  // Same retry policy as main.tsx: the query succeeds (as unavailable) after exactly one request.
  const client = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => !(error instanceof ApiError && [401, 403].includes(error.status)) && count < 1 } } });
  calendarCalls = 0;
  const data = await client.fetchQuery({ queryKey: ['calendar', 'events', 'a', 'b'], queryFn: () => fetchCalendarEvents('2026-11-01', '2026-11-09') });
  assert.equal(data.unavailable, true);
  assert.equal(calendarCalls, 1);
  assert.equal(client.getQueryState(['calendar', 'events', 'a', 'b'])?.status, 'success');

  for (const response of [
    () => { throw new TypeError('Failed to fetch'); },
    () => new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => Response.json([]),
    () => Response.json({ synthetic: true }),
    () => Response.json({ error: 'unavailable' }, { status: 503 }),
  ]) {
    respond = response;
    assert.deepEqual(await fetchCalendarEvents('2026-11-01', '2026-11-09'), CALENDAR_UNAVAILABLE);
  }
  respond = () => Response.json({ enabled: false, feeds: [], events: [] });
  assert.deepEqual(await fetchCalendarEvents('2026-11-01', '2026-11-09'), { enabled: false, feeds: [], events: [] });
  respond = () => { throw new DOMException('Session changed', 'AbortError'); };
  await assert.rejects(fetchCalendarEvents('2026-11-01', '2026-11-09'), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});
