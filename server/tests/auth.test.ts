import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApiApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { readAuthConfig, type AuthConfig } from '../src/auth/config';
import { FileSessionStore } from '../src/auth/fileStore';

// Never import index.ts, route modules, dotenv or the productivity database.
const origin = 'https://workspace.test';
const password = 'synthetic-password-for-tests-only';
const privatePaths = [...readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8').matchAll(/app\.use\('(\/api\/[^']+)'/g)].map(match => match[1]);

async function fixture(t: TestContext, overrides: Partial<AuthConfig> = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'workspace-auth-tests-'));
  const config: AuthConfig = { passwordHash: await hashPassword(password), sessionSecret: 'ab'.repeat(32), sessionDir: directory,
    sessionTtlMs: 86400000, secure: true, origins: [origin], trustProxy: 1, legacyExpiresAt: 0, ...overrides };
  function makeApp() {
    const app = createApiApp(config);
    for (const url of privatePaths) app.use(url, (_req, res) => res.json({ synthetic: true }));
    app.use('/api/future-route', (_req, res) => res.json({ synthetic: true }));
    return app;
  }
  let server = makeApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  let cookie = '';
  let csrf = '';
  const call = (url: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) => {
    const address = server.address() as { port: number };
    return fetch(`http://127.0.0.1:${address.port}${url}`, { method, headers: {
      'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf, ...extra,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const absorb = async (response: Response) => {
    assert.equal(response.status, 200);
    const value = await response.json();
    cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    csrf = value.csrfToken;
    return value;
  };
  const initialize = () => call('/api/auth/session').then(absorb);
  const login = () => call('/api/auth/login', 'POST', { password }).then(absorb);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('workspace-auth-tests-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return { config, directory, call, initialize, login, cookie: () => cookie, csrf: () => csrf,
    async restart() {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      server = makeApp().listen(0, '127.0.0.1');
      await once(server, 'listening');
    } };
}

test('all mounted private APIs and future paths reject unauthenticated requests without creating sessions', async t => {
  const f = await fixture(t);
  assert.equal(privatePaths.length, 18);
  for (const url of [...privatePaths, '/api/future-route']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await f.call(url, method);
      assert.equal(response.status, 401, `${method} ${url}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
    }
  }
  assert.deepEqual(readdirSync(f.directory), []);
});

test('correct login rotates session/CSRF, secure cookie, persistence, logout revocation', async t => {
  const f = await fixture(t);
  const initialized = await f.call('/api/auth/session');
  const header = initialized.headers.get('set-cookie')!;
  assert.match(header, /^__Host-workspace.sid=/);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Expires=']) assert.ok(header.includes(attribute));
  assert.ok(!header.includes('Domain='));
  await f.initialize();
  const oldCookie = f.cookie(), oldCsrf = f.csrf();
  assert.equal((await f.login()).authenticated, true);
  // A valid browser session cannot substitute for the separate widget bearer.
  assert.equal((await f.call('/api/widgets/today')).status, 401);
  assert.notEqual(f.cookie(), oldCookie);
  assert.notEqual(f.csrf(), oldCsrf);
  assert.equal((await f.call('/api/tasks', 'GET', undefined, { Cookie: oldCookie })).status, 401);
  for (const url of privatePaths) assert.equal((await f.call(url)).status, 200);
  assert.equal((await f.call('/api/tasks', 'POST', { synthetic: true })).status, 200);
  const validCookie = f.cookie();
  await f.restart();
  assert.equal((await f.initialize()).authenticated, true);
  const loggedOut = await f.call('/api/auth/logout', 'POST');
  assert.equal(loggedOut.status, 204);
  assert.match(loggedOut.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
  assert.equal((await f.call('/api/tasks', 'GET', undefined, { Cookie: validCookie })).status, 401);
  await f.restart();
  assert.equal((await f.call('/api/tasks', 'GET', undefined, { Cookie: validCookie })).status, 401);
});

test('wrong passwords do not authenticate and login attempts are bounded', async t => {
  const f = await fixture(t);
  await f.initialize();
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await f.call('/api/auth/login', 'POST', { password: 'synthetic-incorrect' });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unable to sign in' });
  }
  assert.equal((await f.call('/api/auth/login', 'POST', { password })).status, 429);
  assert.equal((await f.call('/api/tasks')).status, 401);
});

test('login, logout and mutations enforce Origin and CSRF', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/auth/session', 'GET', undefined, { Origin: 'https://evil.test' })).status, 403);
  await f.initialize();
  assert.equal((await f.call('/api/auth/login', 'POST', { password }, { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await f.call('/api/auth/login', 'POST', { password }, { Origin: 'https://evil.test' })).status, 403);
  await f.login();
  for (const url of ['/api/tasks', '/api/auth/logout']) {
    for (const extra of [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://evil.test' }, { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': 'wrong' }]) {
      assert.equal((await f.call(url, 'POST', {}, extra)).status, 403);
    }
  }
  assert.equal((await f.call('/api/tasks')).status, 200);
});

test('expired sessions and changed password hashes are rejected', async t => {
  const f = await fixture(t);
  await f.initialize(); await f.login();
  for (const name of readdirSync(f.directory)) {
    const filename = path.join(f.directory, name);
    const record = JSON.parse(readFileSync(filename, 'utf8'));
    if (record.session?.owner) { record.expiresAt = Date.now() - 1; writeFileSync(filename, JSON.stringify(record)); }
  }
  assert.equal((await f.call('/api/tasks')).status, 401);
  await f.initialize(); await f.login();
  f.config.passwordHash = await hashPassword('synthetic-new-password');
  await f.restart();
  assert.equal((await f.call('/api/tasks')).status, 401);
});

test('legacy is opt-in, deadline-bound and cannot log into a browser session', async t => {
  const f = await fixture(t);
  const extra = { Authorization: 'Bearer synthetic-legacy-token' };
  assert.equal((await f.call('/api/tasks', 'GET', undefined, extra)).status, 401);
  f.config.legacyToken = 'synthetic-legacy-token'; f.config.legacyExpiresAt = Date.now() + 60000;
  assert.equal((await f.call('/api/tasks', 'POST', {}, extra)).status, 200);
  assert.equal((await f.call('/api/tasks', 'POST', {}, { ...extra, Origin: 'https://evil.test' })).status, 403);
  const info = await (await f.call('/api/auth/session', 'GET', undefined, extra)).json();
  assert.equal(info.authenticated, false);
  // An old tab may coexist with a new tab's cookie during migration.
  await f.initialize(); await f.login();
  assert.equal((await f.call('/api/tasks', 'POST', {}, { ...extra, 'X-CSRF-Token': '' })).status, 200);
  f.config.legacyExpiresAt = Date.now() - 1;
  assert.equal((await f.call('/api/tasks', 'GET', undefined, { ...extra, Cookie: '' })).status, 401);
  f.config.legacyExpiresAt = Date.now() + 60000; f.config.legacyToken = undefined;
  assert.equal((await f.call('/api/tasks', 'GET', undefined, { ...extra, Cookie: '' })).status, 401);
  assert.equal((await f.call('/api/tasks', 'POST', {}, { ...extra, 'X-CSRF-Token': '' })).status, 403);
});

test('configuration fails closed, production cookie settings cannot be disabled', async () => {
  const base = { AUTH_PASSWORD_HASH: await hashPassword(password), SESSION_SECRET: 'cd'.repeat(32), NODE_ENV: 'production', DATA_DIR: '/synthetic', ALLOWED_ORIGINS: origin };
  assert.throws(() => readAuthConfig({}), /AUTH_PASSWORD_HASH/);
  assert.equal(readAuthConfig(base).secure, true);
  assert.equal(readAuthConfig({ ...base, APP_TOKEN: 'synthetic' }).legacyToken, undefined);
  assert.throws(() => readAuthConfig({ ...base, LEGACY_AUTH_ENABLED: 'true' }), /Legacy migration/);
  assert.throws(() => readAuthConfig({ ...base, ALLOWED_ORIGINS: '*' }), /ALLOWED_ORIGINS/);
  assert.throws(() => readAuthConfig({ ...base, TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.equal(readAuthConfig({ ...base, NODE_ENV: 'development' }).secure, false);
});

test('store fails closed on corruption and cannot resurrect revoked IDs', async t => {
  const f = await fixture(t);
  const store = new FileSessionStore(f.directory);
  const data = { expiresAt: Date.now() + 60000, csrfToken: 'synthetic' } as any;
  store.set('synthetic-id', data, error => assert.ifError(error));
  store.destroy('synthetic-id', error => assert.ifError(error));
  store.set('synthetic-id', data, error => assert.ifError(error));
  store.get('synthetic-id', (error, value) => { assert.equal(error, null); assert.equal(value, null); });
  writeFileSync(path.join(f.directory, readdirSync(f.directory)[0]), 'invalid-json');
  store.get('synthetic-id', error => assert.ok(error));
});
