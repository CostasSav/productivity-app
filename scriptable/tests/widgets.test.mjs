// Desktop-only tests. Never transfer this file to Scriptable. No network or real credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const key = 'myworkspace.widget.read.v1';
const synthetic = 'x'.repeat(43);
const endpoint = 'https://productivity-server-production-3494.up.railway.app/api/widgets/today';
function snapshot(total = 5) {
  const items = Array.from({ length: Math.min(total, 10) }, (_, i) => ({ id: i + 1, title: 'Task ' + i, status: i === 0 ? 'done' : 'todo', priority: 'medium', deadline: '2026-10-13' }));
  const cohort = { total, completed: total ? 1 : 0, remaining: total ? total - 1 : 0, progress: total ? Math.round(10000 / total) / 10000 : null, truncated: total > 10 };
  return { schemaVersion: 1, date: '2026-10-13', timeZone: 'Europe/Paris', generatedAt: '2026-10-13T12:00:00Z',
    tasks: { ...cohort, scope: 'due-today', items },
    habits: { ...cohort, items: items.map((t, i) => ({ id: t.id, name: 'Habit ' + i, icon: i === 1 ? '🌿' : 'unusual_icon', color: '#0D9488', frequency: 'weekly_count', completedToday: i === 0, weekly: { completed: 2, target: 3, remaining: 1 } })) } };
}
async function run(name, options = {}) {
  const text = [], alerts = [], requests = [], previews = [], bars = [], stacks = [];
  const store = new Map(options.missing ? [] : [[key, synthetic]]);
  if (options.action) store.set('myworkspace.widget.action.v1', 'y'.repeat(43));
  const choices = [...(options.choices || [])];
  let widget, completed = false;
  class Element {
    addText(value) { assert.equal(typeof value, 'string'); text.push(value); return {}; }
    addDate(value) { assert.ok(Number.isFinite(value.getTime())); return { applyRelativeStyle() {} }; }
    addStack() { const stack = new Element(); stacks.push(stack); return stack; }
    addImage() { return {}; }
    addSpacer() {}
    centerAlignContent() {}
    setPadding() {}
    async presentSmall() { previews.push('small'); }
    async presentMedium() { previews.push('medium'); }
    async presentLarge() { previews.push('large'); }
  }
  class Request {
    constructor(url) { assert.equal(url, endpoint); requests.push(this); }
    async loadString() {
      assert.equal(this.method, 'GET');
      assert.equal(this.headers.Authorization, 'Bearer ' + synthetic);
      assert.equal(this.allowInsecureRequest, false);
      assert.equal(this.onRedirect({ url: 'https://untrusted.test' }), null);
      assert.equal(this.timeoutInterval, 12);
      if (options.network) throw new Error('Do not expose ' + synthetic);
      this.response = { statusCode: options.status || 200 };
      if (options.throwStatus) throw new Error('Do not expose ' + synthetic);
      return options.body === undefined ? JSON.stringify(options.data || snapshot()) : options.body;
    }
  }
  class Alert {
    constructor() { alerts.push(this); this.actions = []; }
    addAction(value) { this.actions.push(value); }
    addDestructiveAction(value) { this.actions.push(value); }
    addCancelAction() {}
    addSecureTextField() { this.secure = true; }
    textFieldValue() { assert.ok(this.secure); return options.input || synthetic; }
    async presentAlert() { return choices.length ? choices.shift() : 0; }
  }
  const context = {
    config: { runsInApp: !!options.app, runsInWidget: !options.app, widgetFamily: options.family || 'medium' },
    Keychain: { contains: k => store.has(k), get: k => store.get(k), set: (k, v) => store.set(k, v), remove: k => store.delete(k) },
    Request, Alert, ListWidget: Element, Color: class {}, LinearGradient: class {},
    Font: { systemFont() {}, semiboldSystemFont() {} }, Size: class {}, Rect: class {},
    DrawContext: class { setFillColor() {} fillRect(rect) { bars.push(rect); } getImage() { return {}; } },
    SFSymbol: { named() { return null; } },
    Script: { setWidget: value => { widget = value; }, complete: () => { completed = true; } },
    console: { log() { assert.fail('must not log'); }, error() { assert.fail('must not log errors'); } },
  };
  let code = fs.readFileSync(new URL('../' + name + '.js', import.meta.url), 'utf8');
  if (options.website !== undefined) code = code.replace('const WEBSITE_URL = "";', 'const WEBSITE_URL = ' + JSON.stringify(options.website) + ';');
  await vm.runInNewContext('(async () => {\n' + code + '\n})()', context, { timeout: 2000 });
  assert.ok(completed);
  assert.ok(!JSON.stringify({ text, alerts }).includes(synthetic));
  assert.ok(!JSON.stringify(stacks).includes(synthetic));
  return { text, alerts, requests, previews, store, widget, bars, stacks };
}

for (const name of ['MyWorkspaceTasks', 'MyWorkspaceHabits']) {
  test(name + ': row links contain only explicit non-secret actions; read-only and small remain unchanged', async () => {
    const data = snapshot(2);
    const r = await run(name, { data, action: true, website: 'https://workspace.example/' });
    const urls = r.stacks.filter(s => s.url).map(s => new URL(s.url));
    assert.equal(urls.length, 2); assert.equal(r.widget.url, 'https://workspace.example/');
    for (const url of urls) {
      assert.equal(url.protocol, 'scriptable:'); assert.equal(url.pathname, '/run');
      assert.equal(url.searchParams.get('scriptName'), 'MyWorkspaceAction');
      assert.equal(url.searchParams.get('kind'), name.endsWith('Tasks') ? 'tasks' : 'habits');
      assert.equal(url.searchParams.get('date'), data.date);
      assert.deepEqual([...url.searchParams.keys()], ['scriptName', 'kind', 'id', 'date', 'expected', 'completed']);
      const id = Number(url.searchParams.get('id'));
      assert.equal(url.searchParams.get('completed'), String(id !== 1));
    }
    assert.equal((await run(name)).stacks.filter(s => s.url).length, 0);
    assert.equal((await run(name, { action: true, family: 'small' })).stacks.filter(s => s.url).length, 0);
  });
  test(name + ': medium full totals, incomplete first, three rows and overflow', async () => {
    const r = await run(name);
    assert.ok(r.text.includes('1 / 5 completed'));
    assert.ok(r.text.includes('+2 more'));
    const rows = r.text.filter(t => /^(Task|Habit) \d/.test(t));
    assert.equal(rows.length, 3);
    assert.match(rows[0], /1$/);
    const refreshDelay = r.widget.refreshAfterDate.getTime() - Date.now();
    assert.ok(refreshDelay > 59 * 60000 && refreshDelay <= 60 * 60000);
    assert.equal(r.requests.length, 1);
  });
  test(name + ': large four rows, small summary and interactive preview', async () => {
    const large = await run(name, { family: 'large', app: true });
    assert.equal(large.text.filter(t => /^(Task|Habit) \d/.test(t)).length, 4);
    assert.deepEqual(large.previews, ['large']);
    const small = await run(name, { family: 'small', app: true });
    assert.equal(small.text.filter(t => /^(Task|Habit) \d/.test(t)).length, 0);
    assert.ok(small.text.includes('4 remaining'));
    assert.deepEqual(small.previews, ['small']);
  });
  test(name + ': empty, truncated backend lists and long titles', async () => {
    const empty = await run(name, { data: snapshot(0) });
    assert.ok(empty.text.some(t => /Nothing due|No habits/.test(t)));
    const data = snapshot(40);
    data.tasks.items[1].title = 'A'.repeat(160);
    data.habits.items[1].name = 'A'.repeat(160);
    const r = await run(name, { data });
    assert.ok(r.text.includes('+37 more'));
    assert.ok(r.text.includes('A'.repeat(100)));
  });
  test(name + ': missing credential never requests network', async () => {
    const r = await run(name, { missing: true });
    assert.equal(r.requests.length, 0);
    assert.ok(r.text.some(t => t.includes('MyWorkspaceSetup')));
  });
  test(name + ': verified HTTPS homepage is navigation only; unsafe URLs ignored', async () => {
    const linked = await run(name, { website: 'https://workspace.example/' });
    assert.equal(linked.widget.url, 'https://workspace.example/');
    assert.equal(linked.requests.length, 1);
    for (const website of ['', 'http://workspace.example', 'javascript:alert(1)', 'https://user:secret@workspace.example',
      'https://workspace.example/?token=private', 'https://workspace.example/#private', 'https://workspace.example/deep-link']) {
      const result = await run(name, { website });
      assert.equal(result.widget.url, undefined);
    }
  });
  for (const status of [401, 403, 429, 503, 302, 404]) {
    test(name + ': safe HTTP ' + status + ', no private rows', async () => {
      const r = await run(name, { status });
      assert.equal(r.text.filter(t => /^(Task|Habit) \d/.test(t)).length, 0);
    });
  }
  test(name + ': offline, invalid JSON, schema and count failures', async () => {
    for (const options of [{ network: true }, { body: '<html>failure</html>' }, { data: { ...snapshot(), schemaVersion: 2 } },
      { data: { ...snapshot(), tasks: { ...snapshot().tasks, total: 2 } } }, { body: 'x'.repeat(50001) }]) {
      const r = await run(name, options);
      assert.equal(r.text.filter(t => /^(Task|Habit) \d/.test(t)).length, 0);
    }
  });
}
test('setup does nothing outside Scriptable app', async () => {
  const r = await run('MyWorkspaceSetup');
  assert.equal(r.alerts.length, 0); assert.equal(r.requests.length, 0);
});
test('habits tolerate absent, empty and unusual decorative icons', async () => {
  for (const icon of [undefined, null, '', 'not a symbol', '👩‍💻']) {
    const data = snapshot();
    data.habits.items[1].icon = icon;
    const r = await run('MyWorkspaceHabits', { data });
    assert.ok(r.text.includes('Habit 1'));
  }
});
test('setup securely validates and saves, without showing the credential', async () => {
  const r = await run('MyWorkspaceSetup', { app: true, missing: true, choices: [0, 0] });
  assert.equal(r.store.get(key), synthetic);
  assert.ok(r.alerts[1].secure);
  assert.equal(r.requests.length, 1);
});
test('setup rejects wrong format without network and preserves existing token', async () => {
  const r = await run('MyWorkspaceSetup', { app: true, input: 'not-a-token', choices: [0, 0] });
  assert.equal(r.store.get(key), synthetic); assert.equal(r.requests.length, 0);
});
test('setup distinguishes auth failure from network failure and does not save', async () => {
  for (const options of [{ status: 401, throwStatus: true }, { network: true }]) {
    const r = await run('MyWorkspaceSetup', { app: true, missing: true, choices: [0, 0], ...options });
    assert.equal(r.store.has(key), false);
    assert.match(r.alerts.at(-1).message, options.network ? /Cannot connect/ : /Credential rejected/);
  }
});
test('setup removal requires confirmation; cancellation preserves credential', async () => {
  const cancelled = await run('MyWorkspaceSetup', { app: true, choices: [1, -1] });
  assert.equal(cancelled.store.get(key), synthetic);
  const removed = await run('MyWorkspaceSetup', { app: true, choices: [1, 0] });
  assert.equal(removed.store.has(key), false);
  assert.equal(removed.requests.length, 0);
});

test('setup stores separate action token only after confirmation and without a production request', async () => {
  const token = 'y'.repeat(43);
  const r = await run('MyWorkspaceSetup', { app: true, input: token, choices: [2, 0, 0] });
  assert.equal(r.store.get(key), synthetic);
  assert.equal(r.store.get('myworkspace.widget.action.v1'), token);
  assert.equal(r.requests.length, 0); assert.ok(r.alerts[1].secure);
  assert.ok(!JSON.stringify(r.alerts).includes(token));
  const cancelled = await run('MyWorkspaceSetup', { app: true, input: token, choices: [2, 0, -1] });
  assert.equal(cancelled.store.has('myworkspace.widget.action.v1'), false);
});
test('setup refuses credential reuse in either direction', async () => {
  const r = await run('MyWorkspaceSetup', { app: true, choices: [2, 0] });
  assert.equal(r.store.has('myworkspace.widget.action.v1'), false);
  const read = await run('MyWorkspaceSetup', { app: true, action: true, input: 'y'.repeat(43), choices: [0, 0] });
  assert.equal(read.store.get(key), synthetic); assert.equal(read.requests.length, 0);
});
test('removing action token requires confirmation and preserves read access', async () => {
  const cancelled = await run('MyWorkspaceSetup', { app: true, action: true, choices: [3, -1] });
  assert.equal(cancelled.store.has('myworkspace.widget.action.v1'), true);
  const removed = await run('MyWorkspaceSetup', { app: true, action: true, choices: [3, 0] });
  assert.equal(removed.store.has('myworkspace.widget.action.v1'), false);
  assert.equal(removed.store.get(key), synthetic); assert.equal(removed.requests.length, 0);
});
