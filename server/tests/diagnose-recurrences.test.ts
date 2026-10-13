import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { diagnose } from '../scripts/diagnose-recurrences';

const task = (id: number, fields = {}) => ({ id, title: 'PRIVATE TITLE', status: 'todo', recurrence: 'daily', deadline: '2026-10-13', ...fields });
test('no recurring tasks and empty database', () => {
  assert.equal(diagnose({ tasks: [] }).totalTasks, 0);
  const r = diagnose({ tasks: [task(1, { recurrence: null })] });
  assert.equal(r.categories.A, 1); assert.equal(r.manualReviewNecessary, false);
});
test('free-text recurrence time is valid historical metadata, not category G', () => {
  const r = diagnose({ tasks: [task(1, { recurrence_time: 'afternoon' }), task(2, { status: 'done', recurrence_time: 'morning' })] });
  assert.equal(r.categories.D, 1); assert.equal(r.categories.E, 1); assert.equal(r.categories.G, 0);
  assert.deepEqual(r.reasonCounts, {});
  assert.deepEqual(r.historicalStates, { activeRecurringMissingMarker: 1, completedRecurringMissingMarker: 1 });
});
test('synthetic 131-record dataset reproduces reported pattern after fixing time validation', () => {
  const tasks = Array.from({ length: 131 }, (_, i) => task(i + 1, i < 87 ? { recurrence: null } : { status: i < 89 ? 'todo' : 'done', recurrence_time: 'afternoon' }));
  const r = diagnose({ tasks });
  assert.deepEqual(r.categories, { A: 87, B: 0, C: 0, D: 2, E: 42, F: 0, G: 0 });
  assert.equal(r.activeRecurringTasksBlockedByAmbiguousRecurrence, 2);
});
test('independent reason counts and guard overlap do not hide secondary problems', () => {
  const r = diagnose({ tasks: [task(1, { deadline: 'bad', recurrence_time: 42 }), task(2), task(2), task(3, { recurrenceIssued: null }), task(4, { recurrence: 'invalid' })] });
  assert.equal(r.reasonCounts['duplicate-id'], 2);
  assert.equal(r.reasonCounts['invalid-recurrenceIssued'], 1);
  assert.equal(r.reasonCounts['invalid-recurrence_time-type'], 1);
  assert.equal(r.reasonCounts['missing-or-invalid-calendar-deadline'], 1);
  assert.equal(r.reasonCounts['invalid-or-missing-recurrence'], 1);
  assert.deepEqual(r.ambiguityGuard, { conditionMatches: 4, preemptedByEarlierBusinessValidation: 2, reachesAmbiguousRecurrence: 2 });
  assert.equal(r.historicalStates.activeRecurringMissingMarker, 3);
});
test('all seven categories are disjoint; monthly metadata supports day 31', () => {
  const input = { tasks: [task(1, { recurrence: null }), task(2, { recurrenceIssued: false }), task(3, { recurrenceIssued: true }),
    task(4), task(5, { status: 'done' }), task(6, { deadline: null }), task(7, { recurrence: 'unknown' }),
    task(8, { recurrence: 'monthly', recurrence_day: 31, recurrenceIssued: false })] };
  const before = JSON.stringify(input);
  const r = diagnose(input);
  assert.deepEqual(r.categories, { A: 1, B: 2, C: 1, D: 1, E: 1, F: 1, G: 1 });
  assert.equal(r.activeRecurringTasksBlockedByAmbiguousRecurrence, 2);
  assert.equal(r.completedRecurringTasksMissingMetadata, 1);
  assert.equal(JSON.stringify(input), before); assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('duplicate IDs, invalid status/marker and malformed entries need separate review', () => {
  const r = diagnose({ tasks: [task(1), task(1), task(2, { recurrenceIssued: null }), task(3, { status: 'invalid' }), null] });
  assert.equal(r.categories.G, 5); assert.equal(r.activeRecurringTasksBlockedByAmbiguousRecurrence, 0);
});
test('truthy invalid deadlines block before date validation; empty deadlines do not', () => {
  const r = diagnose({ tasks: [task(1, { deadline: 'bad' }), task(2, { deadline: '' }), task(3, { deadline: '2026-02-30' }), task(4, { deadline: null })] });
  assert.equal(r.categories.F, 4); assert.equal(r.activeRecurringTasksBlockedByAmbiguousRecurrence, 2);
});
test('details expose only the allowlisted fields, never unrelated data', () => {
  const r = diagnose({ password: 'DO NOT PRINT', tasks: [task(1, { notes: 'DO NOT PRINT', token: 'DO NOT PRINT' })] }, true);
  assert.ok(JSON.stringify(r).includes('PRIVATE TITLE')); assert.ok(!JSON.stringify(r).includes('DO NOT PRINT'));
  assert.throws(() => diagnose({ tasks: {} }));
});
test('CLI requires an explicit path, sanitizes corrupt input, and leaves snapshot bytes/mtime unchanged', t => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'workspace-diagnostic-tests-'));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('workspace-diagnostic-tests-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, 'snapshot.json');
  const bytes = JSON.stringify({ tasks: [task(1)], notes: ['PRIVATE NOTES'] });
  fs.writeFileSync(file, bytes);
  const before = fs.statSync(file).mtimeMs;
  const run = (args: string[]) => spawnSync(process.execPath, [require.resolve('tsx/cli'), path.resolve(__dirname, '../scripts/diagnose-recurrences.ts'), ...args],
    { encoding: 'utf8', env: { ...process.env, DATA_DIR: 'DO-NOT-USE' } });
  const good = run([file]); assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).categories.D, 1); assert.ok(!good.stdout.includes('PRIVATE'));
  assert.equal(run([file, '--details']).status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes); assert.equal(fs.statSync(file).mtimeMs, before);
  assert.deepEqual(fs.readdirSync(dir), ['snapshot.json']);
  for (const args of [[], ['relative.json'], ['//network/share/snapshot.json'], [path.join(dir, 'missing.json')], [dir], [file, '--write']]) assert.equal(run(args).status, 1);
  fs.writeFileSync(file, '{"PRIVATE CORRUPT');
  const bad = run([file]); assert.equal(bad.status, 1); assert.ok(!bad.stderr.includes('PRIVATE')); assert.equal(bad.stdout, '');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"PRIVATE CORRUPT');
});
