import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createApiApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { readWidgetConfig } from '../src/widgets/config';
import { buildWidgetSnapshot, type WidgetData } from '../src/widgets/snapshot';
import type { Task, Habit, HabitLog } from '../src/types';

// Fixed synthetic value only; the operator generator is NEVER executed by tests.
const token = 'a'.repeat(43);
const env = { WIDGET_READ_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
  WIDGET_READ_TOKEN_EXPIRES_AT: '2030-01-01T00:00:00Z', WIDGET_TIME_ZONE: 'Europe/Paris' };
const instant = new Date('2026-10-13T12:00:00Z'); // Tuesday
const task = (id: number, fields: Partial<Task> = {}): Task => ({ id, title: 'Synthetic', status: 'todo', priority: 'medium', deadline: '2026-10-13', ...fields } as Task);
const habit = (id: number, fields: Partial<Habit> = {}): Habit => ({ id, name: 'Synthetic', icon: 'star', color: '#123456', frequency: 'daily', archivedAt: null, targetDays: [], targetCount: null, order: id, ...fields } as Habit);
const log = (habitId: number, completedAt: string): HabitLog => ({ id: 1, habitId, completedAt, note: null });
const empty = (): WidgetData => ({ tasks: [], habits: [], habitLogs: [] });
const snapshot = (data: WidgetData, now = instant) => buildWidgetSnapshot(data, 'Europe/Paris', now);

async function fixture(t: TestContext, config = readWidgetConfig(env), read = empty) {
  const directory = mkdtempSync(path.join(tmpdir(), 'workspace-widget-tests-'));
  const app = createApiApp({ passwordHash: await hashPassword('synthetic-test-password'), sessionSecret: 'cd'.repeat(32),
    sessionDir: directory, secure: true, origins: ['https://workspace.test'], trustProxy: false,
    sessionTtlMs: 86400000, legacyExpiresAt: 0 }, { config, read, now: () => instant });
  for (const route of ['/tasks', '/habits', '/notes', '/ai', '/future']) app.get('/api' + route, (_req, res) => res.json({ private: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('workspace-widget-tests-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { directory, call: (route = '/api/widgets/today', authorization: string | null = `Bearer ${token}`, method = 'GET') =>
    fetch(base + route, { method, headers: authorization === null ? {} : { Authorization: authorization } }) };
}

test('widget config fails closed for absent, malformed digest, expiration and timezone', () => {
  assert.equal(readWidgetConfig({}), null);
  for (const override of [{ WIDGET_READ_TOKEN_SHA256: 'bad' }, { WIDGET_READ_TOKEN_EXPIRES_AT: 'tomorrow' },
    { WIDGET_READ_TOKEN_EXPIRES_AT: '2026-02-30T00:00:00Z' }, { WIDGET_TIME_ZONE: 'Invalid/Zone' }]) {
    assert.equal(readWidgetConfig({ ...env, ...override }), null);
  }
  assert.equal(readWidgetConfig({ ...env, WIDGET_TIME_ZONE: undefined })!.timeZone, 'Europe/Paris');
});

test('valid bearer without Origin/cookies/CSRF returns no-store snapshot and creates no session', async t => {
  const f = await fixture(t);
  const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await response.json()).schemaVersion, 1);
  assert.deepEqual(readdirSync(f.directory), []);
});

test('missing, invalid and malformed bearer credentials rejected before reading data', async t => {
  const f = await fixture(t, readWidgetConfig(env), () => { assert.fail('must not read'); });
  for (const header of [null, 'Bearer bad', `Bearer ${'b'.repeat(43)}`, token, `Basic ${token}`, `Bearer ${token}, Bearer ${token}`]) {
    const response = await f.call(undefined, header);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  }
});

test('disabled, expired and revoked/rotated configuration denies widget only', async t => {
  for (const config of [null, readWidgetConfig({ ...env, WIDGET_READ_TOKEN_EXPIRES_AT: instant.toISOString() }),
    readWidgetConfig({ ...env, WIDGET_READ_TOKEN_SHA256: '00'.repeat(32) })]) {
    const f = await fixture(t, config);
    assert.equal((await f.call()).status, 401);
    assert.equal((await f.call('/api/auth/session', null)).status, 200);
  }
});

test('widget token cannot authorize general routes or writes; unknown widget routes terminate', async t => {
  const f = await fixture(t);
  for (const route of ['tasks', 'habits', 'notes', 'ai', 'future']) assert.equal((await f.call('/api/' + route)).status, 401);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) assert.equal((await f.call(undefined, undefined, method)).status, 403);
  assert.equal((await f.call('/api/widgets/unknown')).status, 404);
  assert.equal((await f.call(undefined, null)).status, 401);
});

test('rate limit includes invalid requests and does not consume browser auth budget', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 60; i++) assert.equal((await f.call(undefined, null)).status, 401);
  const limited = await f.call();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('cache-control'), 'no-store');
  assert.equal((await f.call('/api/auth/session', null)).status, 200);
});

test('database failure returns sanitized 503', async t => {
  const f = await fixture(t, readWidgetConfig(env), () => { throw new Error('synthetic private contents'); });
  const response = await f.call();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Widget data unavailable. Try again later.' });
});

test('empty cohorts use null progress', () => {
  const result = snapshot(empty());
  for (const group of [result.tasks, result.habits]) assert.deepEqual(group.items, []);
  assert.equal(result.tasks.total, 0); assert.equal(result.habits.progress, null);
});

test('due-today full task counts, ordering, timestamp deadlines and excluded invalid dates', () => {
  const data = empty();
  data.tasks = [task(1, { status: 'done' }), task(2), task(3, { deadline: '2026-10-12T22:30:00Z' }),
    task(4, { deadline: null }), task(5, { deadline: '2026-10-14' }), task(6, { deadline: '2026-10-12' }),
    task(7, { deadline: 'bad' }), task(8, { deadline: '2026-02-30' })];
  const result = snapshot(data).tasks;
  assert.equal(result.total, 3); assert.equal(result.completed, 1); assert.equal(result.remaining, 2);
  assert.equal(result.progress, 0.3333); assert.deepEqual(result.items.map(t => t.id), [2, 3, 1]);
});

test('daily, selected weekdays, archived and malformed schedules', () => {
  const data = empty();
  data.habits = [habit(1), habit(2, { frequency: 'weekly', targetDays: [2, 4] }),
    habit(3, { frequency: 'weekly', targetDays: [1] }), habit(4, { archivedAt: '2026-10-01' }),
    habit(5, { frequency: 'weekly', targetDays: [] }), habit(6, { frequency: 'weekly_count', targetCount: 0 }),
    habit(7, { frequency: 'weekly', targetDays: [2, 9] })];
  data.habitLogs = [log(1, '2026-10-13T09:00:00Z'), log(1, '2026-10-13T10:00:00Z')];
  const result = snapshot(data).habits;
  assert.equal(result.total, 2); assert.equal(result.completed, 1); assert.equal(result.progress, 0.5);
  assert.deepEqual(result.items.map(h => h.id), [2, 1]);
  assert.deepEqual(result.items[0].weekly, { completed: 0, target: 2, remaining: 2 });
});

test('weekly-count cohort survives target completion today, distinct dates, Monday reset', () => {
  const data = empty();
  data.habits = [habit(1, { frequency: 'weekly_count', targetCount: 2 })];
  data.habitLogs = [log(1, '2026-10-12T09:00:00Z'), log(1, '2026-10-12T10:00:00Z'),
    log(1, '2026-10-11T10:00:00Z'), log(1, 'bad'), log(1, '2026-10-18T10:00:00Z')];
  assert.equal(snapshot(data).habits.items[0].weekly!.completed, 1);
  data.habitLogs.push(log(1, '2026-10-13T10:00:00Z'));
  const result = snapshot(data).habits;
  assert.equal(result.total, 1); assert.equal(result.progress, 1);
  assert.deepEqual(result.items[0].weekly, { completed: 2, target: 2, remaining: 0 });
  assert.equal(snapshot(data, new Date('2026-10-14T12:00:00Z')).habits.total, 0);
  assert.equal(snapshot(data, new Date('2026-10-19T12:00:00Z')).habits.items[0].weekly!.completed, 0);
});

test('Paris midnight, spring/fall DST and explicit timestamp offsets', () => {
  for (const [iso, date] of [['2026-03-28T22:59:59Z', '2026-03-28'], ['2026-03-28T23:00:00Z', '2026-03-29'],
    ['2026-03-29T01:00:00Z', '2026-03-29'], ['2026-03-29T22:00:00Z', '2026-03-30'],
    ['2026-10-25T00:30:00Z', '2026-10-25'], ['2026-10-25T01:30:00Z', '2026-10-25'],
    ['2026-10-25T23:00:00Z', '2026-10-26']]) assert.equal(snapshot(empty(), new Date(iso)).date, date);
  const data = empty(); data.habits = [habit(1)];
  data.habitLogs = [log(1, '2026-10-25T02:30:00+02:00'), log(1, '2026-10-25T02:30:00+01:00')];
  assert.equal(snapshot(data, new Date('2026-10-25T12:00:00Z')).habits.completed, 1);
});

test('bounded response lists/text, full counts and no input mutation or sensitive fields', () => {
  const data = empty();
  data.tasks = Array.from({ length: 100 }, (_, i) => task(i + 1, { title: '\u0000'.repeat(5000), description: 'PRIVATE' }));
  data.habits = Array.from({ length: 100 }, (_, i) => habit(i + 1, { name: '\u0000'.repeat(5000), description: 'PRIVATE' }));
  const before = JSON.stringify(data);
  const result = snapshot(data);
  assert.equal(result.tasks.total, 100); assert.equal(result.habits.total, 100);
  assert.equal(result.tasks.items.length, 10); assert.equal(result.habits.items.length, 10);
  assert.equal(result.tasks.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 40000);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(JSON.stringify(data), before);
});

test('actual database widget read preserves file bytes and directory contents', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'workspace-widget-tests-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('workspace-widget-tests-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const filename = path.join(directory, 'db.json');
  const original = JSON.stringify({ tasks: [task(1)], notes: [], _taskSeq: 1, _noteSeq: 0 });
  writeFileSync(filename, original);
  const database = path.resolve(__dirname, '../src/db/database.ts');
  const runner = path.resolve(__dirname, '../../node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(process.execPath, [runner, '-e', `const {db}=require(${JSON.stringify(database)}); const d=db.getWidgetData(); if(d.tasks.length!==1 || d.habits.length!==0) throw new Error('bad');`],
    { env: { ...process.env, DATA_DIR: directory }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(filename, 'utf8'), original);
  assert.deepEqual(readdirSync(directory), ['db.json']);
});
