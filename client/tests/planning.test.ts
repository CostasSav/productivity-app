import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampCreate, clampMove, clampResize, computeReorder, displayedOrderPayload, freeGap, groupPriority, nextGroupPriority, rootDisplayEntries,
  sortedModeDrop, weekMonday,
} from '../src/utils/planning';
import type { PlanningGroup, PlanningItem, Task } from '../src/types';

test('sorted modes put root items first; drops keep them there; apply writes the displayed order', () => {
  const g = (id: number, order: number, priority: PlanningGroup['priority']) =>
    ({ id, planningId: 1, taskId: null, name: `G${id}`, order, collapsed: false, priority }) as PlanningGroup;
  const it = (id: number, groupId: number | null, order: number, end?: string) =>
    ({ id, planningId: 1, groupId, taskId: null, subtaskId: null, title: `I${id}`, owner: null, progress: 0, progressBeforeDone: null, order,
      segments: end ? [{ id: `s${id}`, start: end, end, color: '#000' }] : [] }) as PlanningItem;
  const planning = {
    groupSortMode: 'custom' as const,
    groups: [g(1, 0, 'low'), g(2, 2, 'high'), g(3, 4, null)],
    items: [it(10, null, 1), it(11, null, 3), it(20, 1, 0, '2026-11-02'), it(21, 2, 0, '2026-12-07'), it(22, 3, 0, '2026-11-16')],
  };
  const keys = (es: { kind: string; id: number }[]) => es.map(e => `${e.kind[0]}${e.id}`).join(' ');
  assert.equal(keys(rootDisplayEntries(planning, [])), 'g1 i10 g2 i11 g3', 'custom interleaves by order');
  assert.equal(keys(rootDisplayEntries({ ...planning, groupSortMode: 'deadline' }, [])), 'i10 i11 g1 g3 g2');
  assert.equal(keys(rootDisplayEntries({ ...planning, groupSortMode: 'priority' }, [])), 'i10 i11 g2 g1 g3');
  // switching modes never touches `order`: back to custom gives the same order
  assert.equal(keys(rootDisplayEntries({ ...planning, groupSortMode: 'custom' }, [])), 'g1 i10 g2 i11 g3');

  // a root item dropped before a group in a sorted mode lands after the last root item
  const sortedPlan = { ...planning, groupSortMode: 'priority' as const };
  assert.deepEqual(sortedModeDrop(sortedPlan, { kind: 'item', id: 20 }, { groupId: null, before: { kind: 'group', id: 2 } }),
    { groupId: null, before: { kind: 'group', id: 3 } });
  assert.deepEqual(sortedModeDrop(sortedPlan, { kind: 'item', id: 20 }, { groupId: null, before: { kind: 'item', id: 10 } }),
    { groupId: null, before: { kind: 'item', id: 10 } }, 'between root items: unchanged');
  assert.deepEqual(sortedModeDrop(planning, { kind: 'item', id: 20 }, { groupId: null, before: { kind: 'group', id: 2 } }),
    { groupId: null, before: { kind: 'group', id: 2 } }, 'custom: unchanged');

  assert.deepEqual(displayedOrderPayload(rootDisplayEntries(sortedPlan, [])), {
    groups: [{ id: 2, order: 2 }, { id: 1, order: 3 }, { id: 3, order: 4 }],
    items: [{ id: 10, order: 0, groupId: null }, { id: 11, order: 1, groupId: null }],
  });
});

test('group priority: live task wins, cycle skips "none" for linked groups', () => {
  const group = { id: 1, planningId: 1, taskId: 7, name: 'G', order: 0, collapsed: false, priority: 'low' } as PlanningGroup;
  const tasks = new Map([[7, { id: 7, priority: 'high' } as Task]]);
  assert.equal(groupPriority(group, tasks), 'high');
  assert.equal(groupPriority(group, new Map()), 'low', 'dangling link uses the stored snapshot');
  assert.equal(groupPriority({ ...group, taskId: null, priority: undefined as never }, tasks), null);
  const cycle = (linked: boolean, from: PlanningGroup['priority']) => {
    const seen = [from];
    for (let i = 0; i < 4; i++) seen.push(nextGroupPriority(seen.at(-1)!, linked));
    return seen;
  };
  assert.deepEqual(cycle(false, null), [null, 'high', 'medium', 'low', null]);
  assert.deepEqual(cycle(true, 'high'), ['high', 'medium', 'low', 'high', 'medium']);
});

test('freeGap is bounded by the nearest neighbours only', () => {
  const others = [{ start: 0, end: 1 }, { start: 8, end: 9 }, { start: 12, end: 12 }];
  assert.deepEqual(freeGap(others, 4, 5), { lo: 2, hi: 7 });
  assert.deepEqual(freeGap([], 4, 5), { lo: -Infinity, hi: Infinity });
});

test('move, resize and create are clamped so segments never overlap', () => {
  const gap = { lo: 2, hi: 7 };
  assert.deepEqual(clampMove({ start: 4, end: 5 }, 10, gap), { start: 6, end: 7 });   // stops at the right neighbour
  assert.deepEqual(clampMove({ start: 4, end: 5 }, -10, gap), { start: 2, end: 3 });  // stops at the left neighbour
  assert.deepEqual(clampMove({ start: 4, end: 5 }, 1, gap), { start: 5, end: 6 });
  assert.deepEqual(clampResize({ start: 4, end: 5 }, 'end', 20, gap), { start: 4, end: 7 });
  assert.deepEqual(clampResize({ start: 4, end: 5 }, 'end', 1, gap), { start: 4, end: 4 }); // never inverts
  assert.deepEqual(clampResize({ start: 4, end: 5 }, 'start', 0, gap), { start: 2, end: 5 });
  assert.deepEqual(clampCreate(5, 1, gap), { start: 2, end: 5 });  // dragging leftwards
  assert.deepEqual(clampCreate(3, 3, gap), { start: 3, end: 3 });  // single click = one week
});

test('weekMonday steps whole weeks', () => {
  assert.equal(weekMonday('2026-11-02', 0), '2026-11-02');
  assert.equal(weekMonday('2026-11-02', 9), '2027-01-04');
});

const item = (id: number, groupId: number | null, order: number): PlanningItem =>
  ({ id, planningId: 1, groupId, taskId: null, subtaskId: null, title: `i${id}`, owner: null, progress: 0, progressBeforeDone: null, order, segments: [] });
const group = (id: number, order: number): PlanningGroup => ({ id, planningId: 1, taskId: null, name: `g${id}`, order, collapsed: false });
// Root: i1(0) g10(1) i2(2) g20(3); g10: i3(0) i4(1); g20: empty
const plan = { groups: [group(10, 1), group(20, 3)], items: [item(1, null, 0), item(2, null, 2), item(3, 10, 0), item(4, 10, 1)] };

test('reorder within root renumbers groups and items in one ordering space', () => {
  assert.deepEqual(computeReorder(plan, { kind: 'item', id: 2 }, { groupId: null, before: { kind: 'item', id: 1 } }), {
    groups: [{ id: 10, order: 2 }, { id: 20, order: 3 }],
    items: [{ id: 2, order: 0, groupId: null }, { id: 1, order: 1, groupId: null }],
  });
});

test('moving an item into and out of groups', () => {
  assert.deepEqual(computeReorder(plan, { kind: 'item', id: 1 }, { groupId: 10, before: { kind: 'item', id: 4 } })?.items,
    [{ id: 3, order: 0, groupId: 10 }, { id: 1, order: 1, groupId: 10 }, { id: 4, order: 2, groupId: 10 }]);
  assert.deepEqual(computeReorder(plan, { kind: 'item', id: 3 }, { groupId: 20, before: null })?.items,
    [{ id: 3, order: 0, groupId: 20 }]);
  const out = computeReorder(plan, { kind: 'item', id: 4 }, { groupId: null, before: null })!;
  assert.deepEqual(out.items.at(-1), { id: 4, order: 4, groupId: null });
});

test('group moves stay at the root; no-op drops return null', () => {
  assert.deepEqual(computeReorder(plan, { kind: 'group', id: 20 }, { groupId: null, before: { kind: 'item', id: 1 } })?.groups,
    [{ id: 20, order: 0 }, { id: 10, order: 2 }]);
  assert.equal(computeReorder(plan, { kind: 'group', id: 10 }, { groupId: 10, before: null }), null);
  assert.equal(computeReorder(plan, { kind: 'item', id: 3 }, { groupId: 10, before: { kind: 'item', id: 4 } }), null); // already there
  assert.equal(computeReorder(plan, { kind: 'item', id: 4 }, { groupId: 10, before: null }), null);
  assert.equal(computeReorder(plan, { kind: 'item', id: 3 }, { groupId: 10, before: { kind: 'item', id: 3 } }), null);
});

// ── Deadline sync helpers (same cases as the server tests) ────────────────────
import { alignedToDeadline, deadlineIssue, formatWeekdayDayMonth, syncedDeadline } from '../src/utils/planning';
import type { Task } from '../src/types';

test('syncedDeadline mirrors the server rule', () => {
  assert.equal(syncedDeadline('2026-11-12', '2026-11-09', '2026-11-23'), '2026-11-26');
  assert.equal(syncedDeadline('2026-11-12', '2026-11-09', '2026-11-02'), '2026-11-05');
  assert.equal(syncedDeadline(null, '2026-11-09', '2026-11-16'), '2026-11-20');
  assert.equal(syncedDeadline('2026-11-12', null, '2026-12-07'), '2026-12-10');
  assert.equal(syncedDeadline('2026-11-12', null, '2026-11-09'), undefined);
  assert.equal(syncedDeadline('2026-11-12', '2026-11-09', '2026-11-09'), undefined);
  assert.equal(syncedDeadline('2026-11-12', '2026-11-09', null), undefined);
});

test('deadline mismatch and align', () => {
  const task = { id: 1, deadline: '2026-11-20' } as Task;
  const withBars = (...ranges: [string, string][]) =>
    ({ ...item(1, null, 0), taskId: 1, segments: ranges.map(([start, end], i) => ({ id: `s${i}`, start, end, color: '#000' })) });
  assert.equal(deadlineIssue(withBars(['2026-11-16', '2026-11-16']), task), null);          // Fri inside the bar's week
  assert.equal(deadlineIssue(withBars(['2026-11-09', '2026-11-16'], ['2026-10-05', '2026-10-05']), task), null); // last = latest end
  const outside = deadlineIssue(withBars(['2026-11-02', '2026-11-09']), task);
  assert.equal(outside?.kind, 'outside');
  assert.deepEqual(alignedToDeadline((outside as { segment: never }).segment, '2026-11-20'), { start: '2026-11-09', end: '2026-11-16' });
  assert.deepEqual(deadlineIssue(withBars(), task), { kind: 'noBar', deadline: '2026-11-20' });
  assert.equal(deadlineIssue(withBars(), { id: 1, deadline: null } as Task), null);
  assert.equal(formatWeekdayDayMonth('2026-12-18'), 'Fri 18/12');
});

// ── Export download helpers ───────────────────────────────────────────────────
import { fileNameFromDisposition, requestBlob } from '../src/api/request';

test('export file name comes from Content-Disposition (UTF-8 form preferred)', () => {
  assert.equal(fileNameFromDisposition(`attachment; filename="Lancement e - 2026-11-03.xlsx"; filename*=UTF-8''Lancement%20%C3%A9%20-%202026-11-03.xlsx`), 'Lancement é - 2026-11-03.xlsx');
  assert.equal(fileNameFromDisposition('attachment; filename="Plain - 2026-11-03.xlsx"'), 'Plain - 2026-11-03.xlsx');
  assert.equal(fileNameFromDisposition('attachment; filename=bare.xlsx'), 'bare.xlsx');
  assert.equal(fileNameFromDisposition(null), null);
});

test('downloads refuse to run without a session', async () => {
  await assert.rejects(requestBlob('/api/plannings/1/export.xlsx'), (e: Error & { status?: number }) => e.status === 401);
});

test('export with the on-screen group order is a POST with the CSRF token; quick export stays a GET', async t => {
  const { browserAuth, clearSession } = await import('../src/api/request');
  const { api } = await import('../src/api');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; clearSession(); });
  const calls: { url: string; method: string; csrf: string | null; body: unknown }[] = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/auth/')) return Response.json({ authenticated: true, csrfToken: 'synthetic-csrf' });
    const headers = new Headers(options.headers);
    calls.push({ url: String(url), method: options.method ?? 'GET', csrf: headers.get('X-CSRF-Token'), body: options.body ? JSON.parse(String(options.body)) : undefined });
    return new Response(new Blob(['xlsx']), { headers: { 'Content-Disposition': 'attachment; filename="P.xlsx"' } });
  };
  await browserAuth.session();
  const res = await api.plannings.exportXlsx(4, { lang: 'en', includeDone: false, groupIds: [3, 1, 2] });
  await api.plannings.exportXlsx(4, { lang: 'fr', includeDone: true });
  assert.equal(res.fileName, 'P.xlsx');
  assert.deepEqual(calls[0], { url: '/api/plannings/4/export', method: 'POST', csrf: 'synthetic-csrf', body: { lang: 'en', includeDone: false, groupIds: [3, 1, 2] } });
  assert.deepEqual([calls[1].method, calls[1].url, calls[1].csrf], ['GET', '/api/plannings/4/export.xlsx?lang=fr&includeDone=true', null]);
});

test('planningItemDone matches the row checkbox rule', async () => {
  const { planningItemDone } = await import('../src/utils/planning');
  const base = { id: 1, planningId: 1, groupId: null, taskId: null, subtaskId: null, title: 'x', owner: null, progress: 0, progressBeforeDone: null, order: 0, segments: [] } as PlanningItem;
  const task = (status: 'todo' | 'done', subStatus: 'todo' | 'done' = 'todo') =>
    ({ id: 5, status, subtasks: [{ id: 9, title: 's', status: subStatus }] }) as unknown as Task;
  const tasks = (t: Task) => new Map([[5, t]]);
  assert.equal(planningItemDone({ ...base, progress: 100 }, new Map()), true, 'standalone at 100%');
  assert.equal(planningItemDone({ ...base, progress: 75 }, new Map()), false);
  assert.equal(planningItemDone({ ...base, taskId: 5, progress: 100 }, tasks(task('todo'))), false, 'linked: the task decides, not the snapshot');
  assert.equal(planningItemDone({ ...base, taskId: 5 }, tasks(task('done'))), true);
  assert.equal(planningItemDone({ ...base, taskId: 5, subtaskId: 9 }, tasks(task('todo', 'done'))), true, 'done subtask');
  assert.equal(planningItemDone({ ...base, taskId: 5, subtaskId: 9 }, tasks(task('done', 'todo'))), true, 'parent done');
  assert.equal(planningItemDone({ ...base, taskId: 5, subtaskId: 9 }, tasks(task('todo', 'todo'))), false);
  assert.equal(planningItemDone({ ...base, taskId: 77, progress: 100 }, new Map()), true, 'dangling link behaves as standalone');
});
