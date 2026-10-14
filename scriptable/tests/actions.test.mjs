// Synthetic Scriptable runtime only: no network, production credentials or personal data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = 'r'.repeat(43), action = 'a'.repeat(43);
const base = 'https://productivity-server-production-3494.up.railway.app/api/widgets';
function snapshot() {
  const group = { total: 1, completed: 0, remaining: 1, progress: 0, truncated: false };
  return { schemaVersion: 1, date: '2026-10-14', timeZone: 'Europe/Paris', generatedAt: '2026-10-14T10:00:00Z',
    tasks: { ...group, scope: 'due-today', items: [{ id: 1, title: 'Synthetic task', status: 'todo', priority: 'medium', deadline: '2026-10-14' }] },
    habits: { ...group, items: [{ id: 2, name: 'Synthetic habit', completedToday: false, frequency: 'daily', weekly: null, color: '#0D9488' }] } };
}
const query = (kind = 'tasks', completed = true) => ({ scriptName: 'MyWorkspaceAction', kind, id: kind === 'tasks' ? '1' : '2',
  date: '2026-10-14', expected: kind === 'tasks' ? (completed ? 'todo' : 'done') : String(!completed), completed: String(completed) });
async function run(options = {}) {
  const requests = [], alerts = [];
  const store = new Map([['myworkspace.widget.read.v1', read], ['myworkspace.widget.action.v1', options.sameToken ? read : action]]);
  if (options.missing) store.delete(options.missing);
  const choices = [...(options.choices || [0])];
  let get = 0, complete = false;
  class Request {
    constructor(url) { assert.ok(url.startsWith(base)); assert.ok(!url.includes(read)); assert.ok(!url.includes(action)); this.url = url; requests.push(this); }
    // Native Scriptable properties cross a bridge: reading a dictionary can return a copy.
    // A plain JS object mock hid nested mutations that never reach the Request setter.
    set headers(value) { this.savedHeaders = { ...value }; }
    get headers() { return { ...this.savedHeaders }; }
    async loadString() {
      assert.equal(this.allowInsecureRequest, false); assert.equal(this.onRedirect({ url: 'https://bad.test' }), null);
      assert.equal(this.timeoutInterval, 12); assert.equal(this.headers['Cache-Control'], 'no-store');
      const writing = this.method !== 'GET';
      assert.equal(this.headers.Authorization, 'Bearer ' + (writing ? action : read));
      if (writing) {
        assert.equal(alerts[0].title, options.query?.completed === 'false' ? 'Mark incomplete?' : 'Mark complete?');
        if (this.headers['Content-Type'] !== 'application/json') {
          this.response = { statusCode: 400 };
          return JSON.stringify({ error: 'INVALID_PAYLOAD' });
        }
        assert.equal(this.headers['Content-Type'], 'application/json');
        assert.deepEqual(Object.keys(JSON.parse(this.body)).sort(), ['completed', 'date']);
        if (options.networkWrite) throw new Error('private ' + action);
        this.response = { statusCode: options.writeStatus || 200 };
        const p = options.query || query();
        return options.writeBody ?? JSON.stringify({ id: Number(p.id), date: p.date, completed: p.completed === 'true', outcome: options.outcome || 'applied' });
      }
      assert.equal(this.url, base + '/today'); assert.equal(this.body, undefined);
      if (options.networkRead) throw new Error('private ' + read);
      this.response = { statusCode: options.readStatus || 200 };
      if (options.readBody !== undefined) return options.readBody;
      const value = options.snapshots?.[get++] || options.snapshot || snapshot();
      return JSON.stringify(value);
    }
  }
  class Alert {
    constructor() { alerts.push(this); this.actions = []; }
    addAction(s) { this.actions.push(s); } addCancelAction() {}
    async presentAlert() { return choices.length ? choices.shift() : 0; }
  }
  const context = { config: { runsInApp: options.app !== false }, args: { queryParameters: options.query || query() },
    Keychain: { contains: k => store.has(k), get: k => store.get(k) }, Request, Alert,
    Script: { complete() { complete = true; } }, console: { log() { assert.fail('No logging'); }, error() { assert.fail('No logging'); } } };
  const source = fs.readFileSync(new URL('../MyWorkspaceAction.js', import.meta.url), 'utf8');
  await vm.runInNewContext('(async () => {\n' + source + '\n})()', context, { timeout: 2000 });
  assert.ok(complete); assert.ok(!JSON.stringify(alerts).includes(read)); assert.ok(!JSON.stringify(alerts).includes(action));
  return { requests, alerts, writes: requests.filter(r => r.method !== 'GET') };
}
for (const kind of ['tasks', 'habits']) for (const completed of [true, false]) {
  test(`${kind}: confirmed explicit ${completed} uses correct method, scope and fresh reads`, async () => {
    const data = snapshot();
    if (!completed) {
      data.tasks.items[0].status = 'done'; data.habits.items[0].completedToday = true;
      for (const group of [data.tasks, data.habits]) { group.completed = 1; group.remaining = 0; group.progress = 1; }
    }
    const r = await run({ query: query(kind, completed), snapshot: data });
    assert.equal(r.requests.length, 3); assert.equal(r.writes.length, 1);
    assert.equal(r.writes[0].method, kind === 'tasks' ? 'PATCH' : 'PUT');
    assert.equal(r.writes[0].url, `${base}/${kind}/${kind === 'tasks' ? 1 : 2}/completion`);
    assert.deepEqual(JSON.parse(r.writes[0].body), { date: data.date, completed });
    assert.match(r.alerts[0].title, completed ? /complete\?/ : /incomplete/);
    assert.match(r.alerts.at(-1).message, /iOS controls/);
    assert.equal(r.alerts.at(-1).title, 'Saved');
  });
}
test('cancelling confirmation sends no write or second read', async () => {
  const r = await run({ choices: [-1] }); assert.equal(r.requests.length, 1); assert.equal(r.writes.length, 0);
  assert.equal(r.alerts.at(-1).title, 'Cancelled');
});

async function widgetQuery(kind, data) {
  const stacks = [];
  class Element {
    addText() { return {}; } addImage() { return {}; } addSpacer() {} centerAlignContent() {} setPadding() {}
    addDate() { return { applyRelativeStyle() {} }; }
    addStack() { const value = new Element(); stacks.push(value); return value; }
  }
  class Request {
    constructor(url) { assert.equal(url, base + '/today'); }
    async loadString() { this.response = { statusCode: 200 }; return JSON.stringify(data); }
  }
  let completed = false;
  const context = { config: { runsInApp: false, widgetFamily: 'medium' },
    Keychain: { contains: () => true, get: () => read }, Request, ListWidget: Element,
    Color: class {}, LinearGradient: class {}, Font: { systemFont() {}, semiboldSystemFont() {} },
    DrawContext: class { setFillColor() {} fillRect() {} getImage() { return {}; } }, Size: class {}, Rect: class {},
    SFSymbol: { named() { return null; } }, Script: { setWidget() {}, complete() { completed = true; } } };
  const source = fs.readFileSync(new URL('../MyWorkspace' + (kind === 'tasks' ? 'Tasks' : 'Habits') + '.js', import.meta.url), 'utf8');
  await vm.runInNewContext('(async () => {\n' + source + '\n})()', context, { timeout: 2000 });
  assert.ok(completed);
  const urls = stacks.filter(s => s.url).map(s => s.url);
  assert.equal(urls.length, 1);
  assert.ok(!urls[0].includes(read)); assert.ok(!urls[0].includes(action));
  const url = new URL(urls[0]);
  assert.equal(url.protocol, 'scriptable:'); assert.equal(url.pathname, '/run');
  return Object.fromEntries(url.searchParams);
}
for (const kind of ['tasks', 'habits']) for (const completed of [true, false]) {
  test(`actual ${kind} widget URL reaches actual handler for desired ${completed}`, async () => {
    const data = snapshot();
    if (!completed) {
      data.tasks.items[0].status = 'done'; data.habits.items[0].completedToday = true;
      for (const group of [data.tasks, data.habits]) { group.completed = 1; group.remaining = 0; group.progress = 1; }
    }
    const parameters = await widgetQuery(kind, data);
    const r = await run({ query: parameters, snapshot: data });
    assert.equal(r.writes.length, 1); assert.equal(r.alerts.at(-1).title, 'Saved');
    assert.equal(JSON.parse(r.writes[0].body).completed, completed);
  });
}
test('actual widget URLs: cancel, malformed/missing parameters and stale state cannot write', async () => {
  for (const kind of ['tasks', 'habits']) {
    const parameters = await widgetQuery(kind, snapshot());
    const cancelled = await run({ query: parameters, choices: [-1] });
    assert.equal(cancelled.writes.length, 0);
    assert.equal(cancelled.alerts.at(-1).title, 'Cancelled');
    for (const change of [p => { p.id = 'invalid'; }, p => { delete p.date; }]) {
      const p = { ...parameters }; change(p);
      const invalid = await run({ query: p });
      assert.equal(invalid.requests.length, 0); assert.equal(invalid.alerts.at(-1).title, 'Invalid action link');
    }
    const stale = snapshot(); stale.date = '2026-10-15';
    assert.equal((await run({ query: parameters, snapshot: stale })).writes.length, 0);
  }
});
test('background, missing credentials and reused tokens cannot send actions', async () => {
  for (const options of [{ app: false }, { missing: 'myworkspace.widget.read.v1' }, { missing: 'myworkspace.widget.action.v1' }, { sameToken: true }]) {
    const r = await run(options); assert.equal(r.requests.length, 0);
  }
});
test('reject malformed/extra/secret URL parameters before any request', async () => {
  for (const changes of [{ id: '01' }, { id: '1.0' }, { id: '-1' }, { id: '9007199254740992' },
    { date: '2026-02-30' }, { kind: 'notes' }, { completed: 'toggle' }, { completed: 'false' },
    { expected: 'unknown' }, { token: 'not-allowed' }, { scriptName: 'OtherScript' }]) {
    const r = await run({ query: { ...query(), ...changes } }); assert.equal(r.requests.length, 0);
  }
  assert.equal((await run({ query: {} })).requests.length, 0);
});
test('stale date, absent row, status mismatch and duplicate IDs refuse writes', async () => {
  for (const edit of [d => { d.date = '2026-10-15'; }, d => { d.tasks.items[0].id = 9; },
    d => { d.tasks.items[0].status = 'in_progress'; }, d => { d.habits.items[0].completedToday = true; },
    d => { d.tasks.items.push(d.tasks.items[0]); d.tasks.total = 2; d.tasks.remaining = 2; }]) {
    const data = snapshot(); edit(data);
    const r = await run({ snapshot: data, query: query(data.habits.items[0].completedToday ? 'habits' : 'tasks') });
    assert.equal(r.writes.length, 0);
  }
});
test('changes during confirmation are rejected, including metadata and day rollover', async () => {
  for (const edit of [d => { d.tasks.items[0].status = 'done'; }, d => { d.tasks.items[0].title = 'Changed synthetic title'; },
    d => { d.timeZone = 'UTC'; }, d => { d.date = '2026-10-15'; }]) {
    const after = snapshot(); edit(after);
    const r = await run({ snapshots: [snapshot(), after] }); assert.equal(r.requests.length, 2); assert.equal(r.writes.length, 0);
  }
});
test('already-applied result is clear and never retried', async () => {
  const r = await run({ outcome: 'already-applied' }); assert.equal(r.writes.length, 1); assert.equal(r.alerts.at(-1).title, 'Already applied');
});
test('HTTP auth, disabled/expired token, conflicts, limits, service errors and redirects are sanitized', async () => {
  const titles = { 400: 'Request rejected', 401: 'Authentication failed', 403: 'Access denied', 404: 'Item unavailable',
    409: 'Completion conflict', 429: 'Request limit reached', 503: 'Server error', 302: 'Not confirmed' };
  for (const writeStatus of [400, 401, 403, 404, 409, 429, 503, 302]) {
    const r = await run({ writeStatus }); assert.equal(r.writes.length, 1); assert.equal(r.alerts.at(-1).title, titles[writeStatus]);
  }
  for (const readStatus of [401, 403, 429, 503, 302]) assert.equal((await run({ readStatus })).writes.length, 0);
});
test('network/invalid responses fail safely without automatic writes or retries', async () => {
  for (const options of [{ networkRead: true }, { readBody: '<html>failure</html>' }, { readBody: 'x'.repeat(50001) },
    { snapshot: { ...snapshot(), schemaVersion: 2 } }]) assert.equal((await run(options)).writes.length, 0);
  for (const options of [{ networkWrite: true }, { writeBody: '<html>failure</html>' },
    { writeBody: JSON.stringify({ id: 9, date: '2026-10-14', completed: true, outcome: 'applied' }) }]) {
    const r = await run(options); assert.equal(r.writes.length, 1); assert.match(r.alerts.at(-1).message, /may have|before trying/);
  }
});
test('syntax validates all standalone scripts including Scriptable top-level await', () => {
  for (const name of ['MyWorkspaceAction', 'MyWorkspaceTasks', 'MyWorkspaceHabits', 'MyWorkspaceSetup']) {
    const source = fs.readFileSync(new URL('../' + name + '.js', import.meta.url), 'utf8');
    new vm.Script('(async () => {\n' + source + '\n})()');
  }
});
