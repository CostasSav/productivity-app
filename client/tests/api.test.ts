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
