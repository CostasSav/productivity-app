import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createPlan, writePlan, reconcile, main } from '../scripts/reconcile-recurrences';
import { updateTaskState, CompletionData } from '../src/db/completion';

const task = (id: number, status = 'todo') => ({ id, title: 'Synthetic private title', status,
  recurrence: 'daily', recurrence_time: 'afternoon', deadline: '2026-10-13', subtasks: [],
  notes: 'Synthetic private notes', updated_at: '2026-10-13T00:00:00Z' });
function fixture(t: { after(fn: () => void): void }) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'workspace-reconcile-tests-'));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('workspace-reconcile-tests-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const snapshot = path.join(dir, 'snapshot.json'), decisions = path.join(dir, 'plan.json');
  const data = { tasks: [task(1), task(2, 'in_progress'), ...Array.from({ length: 42 }, (_, i) => task(i + 3, 'done'))],
    habits: [], habitLogs: [], _taskSeq: 44, _habitLogSeq: 0, settings: { arbitrary: 'PRESERVE' } };
  fs.writeFileSync(snapshot, JSON.stringify(data));
  const save = (changes: (p: ReturnType<typeof createPlan>) => void) => {
    const p = createPlan(snapshot); changes(p); fs.writeFileSync(decisions, JSON.stringify(p)); return p;
  };
  const options = { apply: true, writerStopped: true, backup: path.join(dir, 'backup.json'), audit: path.join(dir, 'audit.jsonl') };
  return { dir, snapshot, decisions, data, save, options };
}
test('planning selects only two active blockers and is byte-for-byte read-only', t => {
  const f = fixture(t), before = fs.readFileSync(f.snapshot), mtime = fs.statSync(f.snapshot).mtimeMs;
  const p = createPlan(f.snapshot);
  assert.deepEqual(p.tasks.map(t => t.id), [1, 2]);
  assert.ok(p.tasks.every(t => t.decision === 'unresolved')); assert.equal(p.operatorApproved, false);
  assert.ok(!JSON.stringify(p).includes('private'));
  writePlan(f.snapshot, f.decisions);
  assert.deepEqual(fs.readFileSync(f.snapshot), before); assert.equal(fs.statSync(f.snapshot).mtimeMs, mtime);
  assert.throws(() => writePlan(f.snapshot, f.decisions));
});
test('default dry-run and explicit approval/offline gates prevent mutation', t => {
  const f = fixture(t); f.save(p => { p.tasks[0].decision = false; });
  const before = fs.readFileSync(f.snapshot);
  assert.equal(reconcile(f.snapshot, f.decisions).proposedChanges, 1);
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options));
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = true; });
  assert.throws(() => reconcile(f.snapshot, f.decisions, { ...f.options, writerStopped: false }));
  assert.throws(() => reconcile(f.snapshot, f.decisions, { apply: true, writerStopped: true }));
  assert.deepEqual(fs.readFileSync(f.snapshot), before);
  assert.deepEqual(fs.readdirSync(f.dir).sort(), ['plan.json', 'snapshot.json']);
});
test('explicit true/false change only markers; verified backup and exact audit preserve 42 completed records', t => {
  const f = fixture(t), before = fs.readFileSync(f.snapshot);
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = true; p.tasks[1].decision = false; });
  assert.equal(reconcile(f.snapshot, f.decisions, f.options).applied, true);
  const after = JSON.parse(fs.readFileSync(f.snapshot, 'utf8'));
  const expected = structuredClone(f.data) as any;
  expected.tasks[0].recurrenceIssued = true; expected.tasks[1].recurrenceIssued = false;
  assert.deepEqual(after, expected); assert.deepEqual(fs.readFileSync(f.options.backup), before);
  const audit = fs.readFileSync(f.options.audit, 'utf8').trim().split('\n').map(s => JSON.parse(s));
  assert.deepEqual(audit[0].approved, [{ id: 1, recurrenceIssued: true }, { id: 2, recurrenceIssued: false }]);
  assert.deepEqual(audit[1].changedIds, [1, 2]); assert.equal(audit[1].state, 'verified');
  assert.ok(!JSON.stringify(audit).includes('private'));
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options)); // old plan is now stale
});
test('unresolved records remain untouched, including all-unresolved no-op', t => {
  const f = fixture(t); f.save(p => { p.operatorApproved = true; });
  assert.equal(reconcile(f.snapshot, f.decisions, f.options).applied, false);
  assert.ok(!fs.existsSync(f.options.backup));
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
  reconcile(f.snapshot, f.decisions, f.options);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.snapshot, 'utf8')).tasks[1], f.data.tasks[1]);
});
test('missing/duplicate plan IDs, omitted entries and edited metadata are rejected', t => {
  const f = fixture(t);
  for (const edit of [
    (p: any) => { p.tasks[0].id = 999; }, (p: any) => { p.tasks[1].id = 1; },
    (p: any) => { p.tasks.pop(); }, (p: any) => { p.tasks[0].deadline = '2026-10-14'; },
    (p: any) => { p.tasks[0].decision = 'false'; }, (p: any) => { p.tasks[0].recordSHA256 = 'bad'; },
  ]) { f.save(edit); assert.throws(() => reconcile(f.snapshot, f.decisions, f.options)); }
  assert.ok(!fs.existsSync(f.options.backup));
});
test('any changed snapshot bytes, status, recurrence, deadline, unrelated field or missing ID invalidates plan', t => {
  const f = fixture(t), original = fs.readFileSync(f.snapshot);
  for (const edit of [
    (d: any) => { d.tasks[0].status = 'done'; }, (d: any) => { d.tasks[0].recurrence = 'weekly'; },
    (d: any) => { d.tasks[0].deadline = '2026-10-14'; }, (d: any) => { d.settings.arbitrary = 'CHANGED'; },
    (d: any) => { d.tasks.shift(); }, (d: any) => { d.tasks.push(d.tasks[0]); },
  ]) {
    fs.writeFileSync(f.snapshot, original); f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
    const data = structuredClone(f.data); edit(data); fs.writeFileSync(f.snapshot, JSON.stringify(data));
    assert.throws(() => reconcile(f.snapshot, f.decisions, f.options));
  }
  fs.writeFileSync(f.snapshot, original); f.save(() => {}); fs.appendFileSync(f.snapshot, '\n');
  assert.throws(() => reconcile(f.snapshot, f.decisions));
});
test('corrupt/invalid input, implicit paths and existing backup/audit fail safely', t => {
  const f = fixture(t); assert.throws(() => createPlan('relative.json'));
  assert.throws(() => createPlan('//network/share.json'));
  assert.throws(() => createPlan(path.join(f.dir, 'missing.json')));
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = true; });
  fs.writeFileSync(f.options.backup, 'KEEP');
  const before = fs.readFileSync(f.snapshot);
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options));
  assert.deepEqual(fs.readFileSync(f.snapshot), before); assert.equal(fs.readFileSync(f.options.backup, 'utf8'), 'KEEP');
  fs.unlinkSync(f.options.backup); fs.writeFileSync(f.options.audit, 'KEEP');
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options)); assert.deepEqual(fs.readFileSync(f.snapshot), before);
  fs.writeFileSync(f.decisions, '{BAD'); assert.throws(() => reconcile(f.snapshot, f.decisions));
  fs.writeFileSync(f.snapshot, '{BAD'); assert.throws(() => createPlan(f.snapshot));
});
test('atomic rename failure leaves original bytes, verified backup and prepared audit', t => {
  const f = fixture(t), before = fs.readFileSync(f.snapshot);
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
  const io = { ...fs, renameSync: (() => { throw new Error('synthetic rename failure'); }) as typeof fs.renameSync };
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options, io));
  assert.deepEqual(fs.readFileSync(f.snapshot), before); assert.deepEqual(fs.readFileSync(f.options.backup), before);
  assert.ok(!fs.readdirSync(f.dir).some(f => f.endsWith('.tmp')));
  assert.equal(JSON.parse(fs.readFileSync(f.options.audit, 'utf8')).state, 'prepared');
});
test('temporary write failure leaves original database intact', t => {
  const f = fixture(t), before = fs.readFileSync(f.snapshot);
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
  const io = { ...fs, writeFileSync: (() => { throw new Error('synthetic disk failure'); }) as typeof fs.writeFileSync };
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options, io));
  assert.deepEqual(fs.readFileSync(f.snapshot), before);
  assert.ok(!fs.readdirSync(f.dir).some(f => f.endsWith('.tmp')));
});
test('last-moment snapshot change is rejected before rename; changed external data is not overwritten', t => {
  const f = fixture(t);
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
  const external = JSON.stringify({ ...f.data, external: 'synthetic external write' });
  const io = { ...fs, fsyncSync: ((fd: number) => {
    fs.fsyncSync(fd); fs.writeFileSync(f.snapshot, external);
  }) as typeof fs.fsyncSync };
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options, io));
  assert.equal(fs.readFileSync(f.snapshot, 'utf8'), external);
});
test('failure after publication retains backup and intent, without automatic rollback', t => {
  const f = fixture(t), before = fs.readFileSync(f.snapshot);
  f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; });
  const io = { ...fs, renameSync: ((from: fs.PathLike, to: fs.PathLike) => {
    fs.renameSync(from, to); throw new Error('synthetic post-publication failure');
  }) as typeof fs.renameSync };
  assert.throws(() => reconcile(f.snapshot, f.decisions, f.options, io));
  assert.equal(JSON.parse(fs.readFileSync(f.snapshot, 'utf8')).tasks[0].recurrenceIssued, false);
  assert.deepEqual(fs.readFileSync(f.options.backup), before);
  assert.equal(JSON.parse(fs.readFileSync(f.options.audit, 'utf8')).state, 'prepared');
});
test('completion compatibility: false issues once, true suppresses, unresolved blocks, legacy done fallback remains conservative', t => {
  const f = fixture(t); f.save(p => { p.operatorApproved = true; p.tasks[0].decision = false; p.tasks[1].decision = true; });
  reconcile(f.snapshot, f.decisions, f.options);
  const data = JSON.parse(fs.readFileSync(f.snapshot, 'utf8')) as CompletionData;
  const next = () => '2026-10-14';
  assert.ok(updateTaskState(data, 1, { status: 'done' }, next)?.nextTask);
  updateTaskState(data, 1, { status: 'todo' }, next);
  assert.equal(updateTaskState(data, 1, { status: 'done' }, next)?.nextTask, null);
  assert.equal(updateTaskState(data, 2, { status: 'done' }, next)?.nextTask, null);
  for (let id = 3; id <= 44; id++) {
    assert.equal(updateTaskState(data, id, { status: 'done' }, next)?.nextTask, null);
    updateTaskState(data, id, { status: 'todo' }, next);
    assert.equal(updateTaskState(data, id, { status: 'done' }, next)?.nextTask, null);
    assert.equal(updateTaskState(data, id, { title: 'Synthetic edit' }, next)?.nextTask, null);
  }
  assert.equal(data.tasks.length, 45);
  const untouched = structuredClone(f.data) as unknown as CompletionData;
  assert.throws(() => updateTaskState(untouched, 1, { status: 'done' }, next), /AMBIGUOUS_RECURRENCE/);
});
test('CLI summary is private and rejects unexpected flags', t => {
  const f = fixture(t), logs: string[] = [], oldLog = console.log, oldError = console.error;
  console.log = s => logs.push(String(s)); console.error = s => logs.push(String(s));
  try {
    assert.equal(main(['plan', f.snapshot, '--out', f.decisions]), 0);
    assert.equal(main(['apply', f.snapshot, '--decisions', f.decisions]), 0);
    assert.equal(main(['apply', f.snapshot, '--decisions', f.decisions, '--unknown']), 1);
    assert.ok(!logs.join('').includes('private')); assert.ok(!logs.join('').includes('recordSHA256'));
    assert.ok(!logs.join('').includes('"id"'));
  } finally { console.log = oldLog; console.error = oldError; }
});
