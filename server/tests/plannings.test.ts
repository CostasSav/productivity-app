import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as p from '../src/db/planning';
import type { PlanningItem, Task } from '../src/types';

const AT = '2026-11-02T10:00:00.000Z';
function task(id: number, fields: Partial<Task> = {}): Task {
  return {
    id, title: `Task ${id}`, description: null, status: 'todo', priority: 'medium', deadline: null, note_id: null,
    section_id: 1, recurrence: null, recurrence_day: null, recurrence_time: null, subtasks: [], pinnedToday: false,
    pinnedAt: null, created_at: `2026-01-0${id}T00:00:00.000Z`, updated_at: AT, ...fields,
  };
}
function fixture(tasks: Task[]): p.PlanningData {
  return {
    sections: [{ id: 1, name: 'Synthetic', color: '#000000', created_at: AT }, { id: 2, name: 'Other', color: '#000000', created_at: AT }],
    tasks, plannings: [], planningGroups: [], planningItems: [], _planningSeq: 0, _planningGroupSeq: 0, _planningItemSeq: 0,
  };
}
function fails(fn: () => unknown, status: number) {
  assert.throws(fn, (e: unknown) => e instanceof p.PlanningError && e.status === status);
}

test('mondayOf snaps every weekday to its Monday', () => {
  assert.equal(p.mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(p.mondayOf('2026-11-05'), '2026-11-02');
  assert.equal(p.mondayOf('2026-11-08'), '2026-11-02'); // Sunday
  assert.equal(p.mondayOf('2027-01-01'), '2026-12-28'); // across year boundary
});

test('import builds groups, linked items, segments, Unscheduled and weekCount', () => {
  const data = fixture([
    task(1, { deadline: '2026-12-10', status: 'done' }),
    task(2, { deadline: '2026-11-04', subtasks: [{ id: 1, title: 'Sub A', status: 'done' }, { id: 2, title: 'Sub B', status: 'todo' }] }),
    task(3),
    task(4, { deadline: '2027-01-20' }),
    task(5, { section_id: 2, deadline: '2026-11-03' }),
  ]);
  const tasksBefore = structuredClone(data.tasks);
  const plan = p.createPlanning(data, { name: 'Launch', sectionId: 1, startDate: '2026-11-04' }, AT, '2026-11-02');
  assert.equal(plan.startDate, '2026-11-02');
  // Latest deadline 2027-01-20 → Monday 2027-01-18 = week index 11 → 12 weeks + 2.
  assert.equal(plan.weekCount, 14);
  assert.deepEqual(plan.legend, p.DEFAULT_LEGEND);

  const [subGroup, unscheduled] = plan.groups;
  assert.equal(subGroup.name, 'Task 2');
  assert.equal(unscheduled.name, 'Unscheduled');
  const root = plan.items.filter(i => i.groupId === null);
  assert.deepEqual(root.map(i => i.taskId), [1, 4]); // ordered by deadline; task 5 is another section
  // Root groups and items share one ordering space, by deadline: task2 group, task1, task4, Unscheduled.
  assert.deepEqual([subGroup.order, root[0].order, root[1].order, unscheduled.order], [0, 1, 2, 3]);

  const subs = plan.items.filter(i => i.groupId === subGroup.id);
  assert.deepEqual(subs.map(i => [i.taskId, i.subtaskId, i.title]), [[2, 1, 'Sub A'], [2, 2, 'Sub B']]);
  assert.deepEqual(subs[0].segments.map(s => [s.start, s.end, s.color]), [['2026-11-02', '2026-11-02', '#22c55e']]);
  assert.deepEqual(root[0].segments.map(s => s.start), ['2026-12-07']);

  const noDeadline = plan.items.filter(i => i.groupId === unscheduled.id);
  assert.deepEqual(noDeadline.map(i => [i.taskId, i.segments.length]), [[3, 0]]);
  assert.deepEqual(data.tasks, tasksBefore, 'import must never modify tasks');
});

test('weekCount has a minimum of 8 and no-section plannings start empty', () => {
  const data = fixture([task(1, { deadline: '2026-11-03' })]);
  assert.equal(p.createPlanning(data, { name: 'A', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02').weekCount, 8);
  const empty = p.createPlanning(data, { name: 'B' }, AT, '2026-11-05');
  assert.equal(empty.startDate, '2026-11-02');
  assert.deepEqual([empty.groups, empty.items], [[], []]);
  fails(() => p.createPlanning(data, { name: 'C', sectionId: 99 }, AT, '2026-11-02'), 404);
  fails(() => p.createPlanning(data, { name: ' ' }, AT, '2026-11-02'), 400);
  fails(() => p.createPlanning(data, { name: 'D', targetDate: '2026-13-01' }, AT, '2026-11-02'), 400);
});

test('create accepts a target date and the list reports item counts', () => {
  const data = fixture([task(1), task(2, { subtasks: [{ id: 1, title: 'a', status: 'todo' }, { id: 2, title: 'b', status: 'todo' }] })]);
  const plan = p.createPlanning(data, { name: 'T', sectionId: 1, targetDate: '2026-12-24' }, AT, '2026-11-02');
  assert.equal(plan.targetDate, '2026-12-24');
  p.createPlanning(data, { name: 'Second for same section', sectionId: 1 }, AT, '2026-11-02');
  assert.deepEqual(p.listPlannings(data).map(x => [x.name, x.itemCount]).sort(), [['Second for same section', 3], ['T', 3]]);
});

test('editing, moving and deleting planning items never touches tasks', () => {
  const data = fixture([task(1, { deadline: '2026-11-10' })]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02');
  const before = structuredClone(data.tasks);
  const item = plan.items[0];
  p.updateItem(data, item.id, { title: 'Renamed', owner: 'Sam', segments: [{ start: '2026-11-12', end: '2026-11-25' }] }, AT);
  assert.deepEqual(data.planningItems[0].segments.map(s => [s.start, s.end]), [['2026-11-09', '2026-11-23']]);
  const group = p.createGroup(data, { planningId: plan.id, name: 'G' }, AT);
  p.reorderPlanning(data, plan.id, { items: [{ id: item.id, order: 0, groupId: group.id }] }, AT);
  p.deleteItem(data, item.id, AT);
  p.deletePlanning(data, plan.id);
  assert.deepEqual(data.tasks, before);
});

test('deleting a task detaches items with a snapshot; dangling links read as standalone', () => {
  const data = fixture([task(1, { deadline: '2026-11-10', subtasks: [{ id: 1, title: 'S1', status: 'done' }, { id: 2, title: 'S2', status: 'todo' }] }), task(2, { title: 'Old' })]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02');
  data.tasks[1].title = 'Live title';
  p.detachDeletedTask(data, 1, 1);
  const s1 = data.planningItems.find(i => i.title === 'S1')!;
  assert.deepEqual([s1.taskId, s1.subtaskId, s1.progress], [null, null, 100]);
  assert.equal(data.planningItems.find(i => i.title === 'S2')!.taskId, 1, 'other subtask stays linked');

  p.detachDeletedTask(data, 2);
  const standalone = data.planningItems.find(i => i.title === 'Live title')!;
  assert.equal(standalone.taskId, null);

  // A dangling link that bypassed detach (e.g. edited file) is reported as null.
  data.tasks = data.tasks.filter(t => t.id !== 1);
  const detail = p.getPlanningDetail(data, plan.id)!;
  assert.ok(detail.items.every(i => i.taskId === null && i.subtaskId === null));
  assert.equal(data.planningItems.length, 3, 'items are never deleted with tasks');
});

test('deleting a section unlinks its plannings', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  p.detachDeletedSection(data, 1);
  assert.equal(data.plannings[0].sectionId, null);
  assert.equal(data.plannings[0].id, plan.id);
});

test('group delete modes', () => {
  const data = fixture([task(1, { subtasks: [{ id: 1, title: 'a', status: 'todo' }, { id: 2, title: 'b', status: 'todo' }] })]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  const groupId = plan.groups[0].id;
  fails(() => p.deleteGroup(data, groupId, undefined, AT), 400);
  p.deleteGroup(data, groupId, 'moveToRoot', AT);
  assert.deepEqual(data.planningItems.map(i => [i.groupId, i.title]), [[null, 'a'], [null, 'b']]);
  assert.ok(data.planningItems[0].order < data.planningItems[1].order);

  const g = p.createGroup(data, { planningId: plan.id, name: 'G' }, AT);
  p.updateItem(data, data.planningItems[0].id, { groupId: g.id }, AT);
  p.deleteGroup(data, g.id, 'deleteItems', AT);
  assert.deepEqual(data.planningItems.map(i => i.title), ['b']);
  assert.equal(data.planningGroups.length, 0);
});

test('segment operations and validation', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P' }, AT, '2026-11-02');
  const item = p.createItem(data, { planningId: plan.id, title: 'Manual', progress: 40 }, AT);
  p.addSegment(data, item.id, { id: 'client-1', start: '2026-11-02', end: '2026-11-16', color: '#3b82f6' }, AT);
  p.addSegment(data, item.id, { start: '2026-12-01', end: '2026-12-01' }, AT);
  fails(() => p.addSegment(data, item.id, { id: 'client-1', start: '2026-11-02', end: '2026-11-02' }, AT), 409);
  fails(() => p.addSegment(data, item.id, { start: '2026-11-16', end: '2026-11-02' }, AT), 400);
  p.updateSegment(data, item.id, 'client-1', { end: '2026-11-30' }, AT);
  assert.deepEqual(item.segments[0], { id: 'client-1', start: '2026-11-02', end: '2026-11-30', color: '#3b82f6' });
  assert.equal(item.segments[1].color, '#22c55e');
  p.deleteSegment(data, item.id, 'client-1', AT);
  assert.equal(item.segments.length, 1);
  fails(() => p.updateSegment(data, item.id, 'client-1', {}, AT), 404);
  fails(() => p.createItem(data, { planningId: plan.id, title: 'x', progress: 101 }, AT), 400);
  fails(() => p.createItem(data, { planningId: plan.id, taskId: 42 }, AT), 404);
});

test('reorder is all-or-nothing and rejects foreign ids', () => {
  const data = fixture([]);
  const a = p.createPlanning(data, { name: 'A' }, AT, '2026-11-02');
  const b = p.createPlanning(data, { name: 'B' }, AT, '2026-11-02');
  const item = p.createItem(data, { planningId: a.id, title: 'i' }, AT);
  const foreign = p.createGroup(data, { planningId: b.id, name: 'g' }, AT);
  fails(() => p.reorderPlanning(data, a.id, { items: [{ id: item.id, order: 5, groupId: foreign.id }] }, AT), 400);
  assert.equal(item.order, 0);
});

test('taskProgress rule', () => {
  assert.equal(p.taskProgress(task(1, { status: 'done' })), 100);
  assert.equal(p.taskProgress(task(1)), 0);
  assert.equal(p.taskProgress(task(1, { subtasks: [{ id: 1, title: '', status: 'done' }, { id: 2, title: '', status: 'todo' }, { id: 3, title: '', status: 'todo' }] })), 33);
});


// ── Missing tasks, import, ignore ────────────────────────────────────────────

const subs = (...titles: string[]) => titles.map((title, i) => ({ id: i + 1, title, status: 'todo' as const }));

test('import stores the parent task on groups made from subtasks', () => {
  const data = fixture([task(1, { subtasks: subs('a', 'b') }), task(2)]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  assert.deepEqual(plan.groups.map(g => [g.name, g.taskId]), [['Task 1', 1], ['Unscheduled', null]]);
  assert.deepEqual(plan.ignoredTaskIds, []);
});

test('missing-tasks: present via item or group, ignored excluded, deadline order, [] without section', () => {
  const data = fixture([task(1, { subtasks: subs('a') }), task(2)]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  assert.deepEqual(p.missingTasks(data, plan.id), []);
  data.tasks.push(task(3), task(4, { deadline: '2026-12-01' }), task(5, { deadline: '2026-11-20' }), task(6, { section_id: 2 }));
  assert.deepEqual(p.missingTasks(data, plan.id).map(t => t.id), [5, 4, 3]);
  p.ignoreTasks(data, plan.id, [4], AT);
  assert.deepEqual(p.missingTasks(data, plan.id).map(t => t.id), [5, 3]);
  const blank = p.createPlanning(data, { name: 'No section' }, AT, '2026-11-02');
  assert.deepEqual(p.missingTasks(data, blank.id), []);
});

test('import-tasks reuses the initial conversion and appends to the target', () => {
  const data = fixture([task(1)]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02');
  const group = p.createGroup(data, { planningId: plan.id, name: 'Phase' }, AT);
  p.createItem(data, { planningId: plan.id, groupId: group.id, title: 'existing' }, AT);
  data.tasks.push(
    task(2, { deadline: '2026-11-12' }),
    task(3, { deadline: '2027-03-03', subtasks: subs('x', 'y') }),
    task(4),
  );
  const tasksBefore = structuredClone(data.tasks);
  const result = p.importTasks(data, plan.id, [
    { taskId: 2, groupId: group.id },
    { taskId: 3, groupId: group.id },   // has subtasks: becomes a root group regardless
    { taskId: 4, groupId: null },
    { taskId: 1, groupId: null },       // already present
    { taskId: 2, groupId: null },       // duplicate in the same request
  ], AT);
  assert.deepEqual(result.skipped, [1, 2]);
  const detail = result.planning;
  const inGroup = detail.items.filter(i => i.groupId === group.id);
  assert.deepEqual(inGroup.map(i => [i.title, i.order]), [['existing', 0], ['Task 2', 1]]);
  assert.deepEqual(inGroup[1].segments.map(s => [s.start, s.end, s.color]), [['2026-11-09', '2026-11-09', '#22c55e']]);
  const newGroup = detail.groups.find(g => g.taskId === 3)!;
  assert.equal(newGroup.name, 'Task 3');
  assert.ok(newGroup.order > group.order, 'new group goes at the end of the root');
  assert.deepEqual(detail.items.filter(i => i.groupId === newGroup.id).map(i => [i.taskId, i.subtaskId, i.title]), [[3, 1, 'x'], [3, 2, 'y']]);
  const plain = detail.items.find(i => i.taskId === 4)!;
  assert.deepEqual([plain.groupId, plain.segments.length], [null, 0]);
  // 2027-03-03 is outside the original 8 weeks: the planning grows to show it.
  assert.ok(detail.weekCount >= 18);
  assert.deepEqual(p.missingTasks(data, plan.id), []);
  assert.deepEqual(data.tasks, tasksBefore, 'importing never modifies tasks');
});

test('import-tasks validates everything before writing', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  const other = p.createPlanning(data, { name: 'Q', sectionId: 1 }, AT, '2026-11-02');
  const foreign = p.createGroup(data, { planningId: other.id, name: 'g' }, AT);
  data.tasks.push(task(1), task(2));
  fails(() => p.importTasks(data, plan.id, [], AT), 400);
  fails(() => p.importTasks(data, plan.id, { taskId: 1 }, AT), 400);
  fails(() => p.importTasks(data, plan.id, [{ taskId: 1 }, { taskId: 99 }], AT), 404);
  fails(() => p.importTasks(data, plan.id, [{ taskId: 1 }, { taskId: 2, groupId: foreign.id }], AT), 400);
  assert.equal(data.planningItems.filter(i => i.planningId === plan.id).length, 0, 'nothing written on a rejected import');
});

test('ignore, un-ignore, and importing an ignored task clears it', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  data.tasks.push(task(1), task(2));
  p.ignoreTasks(data, plan.id, [2, 1, 2], AT);
  assert.deepEqual(data.plannings[0].ignoredTaskIds, [1, 2]);
  fails(() => p.ignoreTasks(data, plan.id, ['x'], AT), 400);
  p.importTasks(data, plan.id, [{ taskId: 1, groupId: null }], AT);
  assert.deepEqual(data.plannings[0].ignoredTaskIds, [2]);
  p.clearIgnoredTasks(data, plan.id, AT);
  assert.deepEqual(p.missingTasks(data, plan.id).map(t => t.id), [2]);
});

test('deleting linked items or task groups ignores their tasks; deleting the real task does not', () => {
  const data = fixture([task(1), task(2, { subtasks: subs('a', 'b') }), task(3, { subtasks: subs('c') }), task(4), task(5)]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  const ignored = () => [...data.plannings[0].ignoredTaskIds];

  p.deleteItem(data, data.planningItems.find(i => i.taskId === 1)!.id, AT);
  assert.deepEqual(ignored(), [1]);
  const standalone = p.createItem(data, { planningId: plan.id, title: 'free' }, AT);
  p.deleteItem(data, standalone.id, AT);
  assert.deepEqual(ignored(), [1], 'standalone items ignore nothing');

  p.deleteGroup(data, data.planningGroups.find(g => g.taskId === 2)!.id, 'moveToRoot', AT);
  assert.deepEqual(ignored(), [1, 2]);
  p.deleteGroup(data, data.planningGroups.find(g => g.name === 'Unscheduled')!.id, 'deleteItems', AT);
  assert.deepEqual(ignored(), [1, 2, 4, 5], `"delete group and its items" ignores each item's task`);
  assert.deepEqual(p.missingTasks(data, plan.id), []);

  // Deleting the real task elsewhere: the item is detached, nothing is ignored.
  p.detachDeletedTask(data, 3);
  data.tasks = data.tasks.filter(t => t.id !== 3);
  assert.deepEqual(ignored(), [1, 2, 4, 5]);
});

test('backfill: ignoredTaskIds and group taskId by exact, unambiguous title match', () => {
  const data = fixture([
    task(1, { title: 'Launch', subtasks: subs('a') }),
    task(2, { title: 'Twin', subtasks: subs('b') }),
    task(3, { title: 'Twin', subtasks: subs('c') }),
    task(4, { title: 'Plain' }),
    task(5, { title: 'Elsewhere', subtasks: subs('d'), section_id: 2 }),
  ]);
  data.plannings.push({ id: 1, name: 'old', sectionId: 1, startDate: '2026-11-02', weekCount: 8, targetDate: null,
    highlightedWeeks: [], legend: [], createdAt: AT, updatedAt: AT } as never);
  data.plannings.push({ id: 2, name: 'no section', sectionId: null, startDate: '2026-11-02', weekCount: 8, targetDate: null,
    highlightedWeeks: [], legend: [], createdAt: AT, updatedAt: AT } as never);
  const legacy = (id: number, planningId: number, name: string) => ({ id, planningId, name, order: id, collapsed: false }) as never;
  data.planningGroups.push(legacy(1, 1, 'Launch'), legacy(2, 1, 'Twin'), legacy(3, 1, 'Plain'), legacy(4, 1, 'launch'),
    legacy(5, 1, 'Elsewhere'), legacy(6, 2, 'Launch'));
  p.backfillPlanningData(data);
  assert.deepEqual(data.plannings.map(x => x.ignoredTaskIds), [[], []]);
  assert.deepEqual(data.planningGroups.map(g => g.taskId), [1, null, null, null, null, null]);
  data.planningGroups[1].taskId = 3;
  p.backfillPlanningData(data);
  assert.equal(data.planningGroups[1].taskId, 3, 'idempotent: existing values are kept');
});


// ── Planning -> task sync ─────────────────────────────────────────────────────

import { updateTaskState } from '../src/db/completion';

/** Same wiring as the database layer: the Tasks page's update logic on the same data. */
function writer(data: p.PlanningData): p.TaskWriter {
  return {
    setTaskFields: (taskId, fields) => { updateTaskState(data as never, taskId, fields, d => d); },
    setSubtaskTitle: (taskId, subId, title) => {
      const t = data.tasks.find(x => x.id === taskId)!;
      t.subtasks = t.subtasks.map(s => (s.id === subId ? { ...s, title } : s));
    },
  };
}
const withSeqs = (data: p.PlanningData) => Object.assign(data, { habits: [], habitLogs: [], _taskSeq: 100, _habitLogSeq: 0 });

test('syncedDeadline rules', () => {
  // existing deadline (Thu) shifts by the weeks the last end moved, keeping its weekday
  assert.equal(p.syncedDeadline('2026-11-12', '2026-11-09', '2026-11-23'), '2026-11-26');
  assert.equal(p.syncedDeadline('2026-11-12', '2026-11-09', '2026-11-02'), '2026-11-05');
  // no deadline -> Friday of the new last week
  assert.equal(p.syncedDeadline(null, '2026-11-09', '2026-11-16'), '2026-11-20');
  // first bar on an item whose task has a deadline: the deadline moves into that week
  assert.equal(p.syncedDeadline('2026-11-12', null, '2026-12-07'), '2026-12-10');
  assert.equal(p.syncedDeadline('2026-11-12', null, '2026-11-09'), undefined, 'bar added on the deadline week changes nothing');
  // unchanged last end, or no bars left: nothing
  assert.equal(p.syncedDeadline('2026-11-12', '2026-11-09', '2026-11-09'), undefined);
  assert.equal(p.syncedDeadline('2026-11-12', '2026-11-09', null), undefined);
});

test('segment actions on the last bar move the linked task deadline in the same call', () => {
  const data = withSeqs(fixture([task(1, { deadline: '2026-11-12' }), task(2), task(3, { subtasks: subs('s') , deadline: '2026-11-12' })]));
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02');
  const w = writer(data);
  const item = plan.items.find(i => i.taskId === 1)!;          // one bar on 2026-11-09
  const first = item.segments[0];

  // add an earlier bar: last end unchanged -> no sync
  const early = p.addSegment(data, item.id, { start: '2026-11-02', end: '2026-11-02' }, AT, w);
  assert.equal(early.deadlineSync, null);
  // move the earlier (non-last) bar: no sync
  assert.equal(p.updateSegment(data, item.id, early.item.segments[1].id, { start: '2026-10-26', end: '2026-10-26' }, AT, w).deadlineSync, null);
  // resize the last bar by two weeks: Thursday kept
  const moved = p.updateSegment(data, item.id, first.id, { end: '2026-11-23' }, AT, w);
  assert.deepEqual(moved.deadlineSync, { taskId: 1, from: '2026-11-12', to: '2026-11-26' });
  assert.equal(data.tasks.find(t => t.id === 1)!.deadline, '2026-11-26');
  // local-only change (align bar): no sync
  assert.equal(p.updateSegment(data, item.id, first.id, { end: '2026-11-30', syncDeadline: false }, AT, w).deadlineSync, null);
  assert.equal(data.tasks.find(t => t.id === 1)!.deadline, '2026-11-26');
  // delete the last bar: the earlier one becomes last -> shift back
  const del = p.deleteSegment(data, item.id, first.id, AT, w);
  // last end was 11-30 after the local align, the earlier bar ends 10-26: five weeks back
  assert.deepEqual(del.deadlineSync, { taskId: 1, from: '2026-11-26', to: '2026-10-22' });
  // delete the only bar left: deadline is kept
  assert.equal(p.deleteSegment(data, item.id, early.item.segments[0].id, AT, w).deadlineSync, null);
  assert.equal(data.tasks.find(t => t.id === 1)!.deadline, '2026-10-22');

  // task without deadline: first bar sets the Friday
  const undated = plan.items.find(i => i.taskId === 2)!;
  assert.deepEqual(p.addSegment(data, undated.id, { start: '2026-11-16', end: '2026-11-23' }, AT, w).deadlineSync, { taskId: 2, from: null, to: '2026-11-27' });

  // standalone items and subtask-linked items never sync
  const free = p.createItem(data, { planningId: plan.id, title: 'free' }, AT);
  assert.equal(p.addSegment(data, free.id, { start: '2026-11-16', end: '2026-11-16' }, AT, w).deadlineSync, null);
  const sub = plan.items.find(i => i.subtaskId !== null)!;
  assert.equal(p.updateSegment(data, sub.id, sub.segments[0].id, { end: '2026-12-07' }, AT, w).deadlineSync, null);
  assert.equal(data.tasks.find(t => t.id === 3)!.deadline, '2026-11-12');

  // dangling link: no sync
  p.detachDeletedTask(data, 2);
  data.tasks = data.tasks.filter(t => t.id !== 2);
});

test('revert restores one segment and the previous deadline without syncing again', () => {
  const data = withSeqs(fixture([task(1, { deadline: '2026-11-12' })]));
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1, startDate: '2026-11-02' }, AT, '2026-11-02');
  const w = writer(data);
  const item = plan.items[0];
  const original = structuredClone(item.segments[0]);
  p.updateSegment(data, item.id, original.id, { start: '2026-11-23', end: '2026-11-23' }, AT, w);
  assert.equal(data.tasks[0].deadline, '2026-11-26');
  p.revertSegment(data, item.id, { segmentId: original.id, segment: original, deadline: '2026-11-12' }, AT, w);
  assert.deepEqual(data.planningItems[0].segments, [original]);
  assert.equal(data.tasks[0].deadline, '2026-11-12');
  // undo of a created bar removes it; undo of a deleted bar re-adds it with its id
  const created = p.addSegment(data, item.id, { id: 'new-bar', start: '2026-12-07', end: '2026-12-07' }, AT, w);
  p.revertSegment(data, item.id, { segmentId: 'new-bar', segment: null, deadline: created.deadlineSync!.from }, AT, w);
  assert.deepEqual(data.planningItems[0].segments.map(s => s.id), [original.id]);
  assert.equal(data.tasks[0].deadline, '2026-11-12');
  fails(() => p.revertSegment(data, item.id, { segment: null }, AT, w), 400);
});

test('renaming linked rows renames the real task or subtask; dangling links rename only the snapshot', () => {
  const data = withSeqs(fixture([task(1), task(2, { subtasks: subs('a') })]));
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  const w = writer(data);
  const item = plan.items.find(i => i.taskId === 1)!;
  p.updateItem(data, item.id, { title: 'Renamed task' }, AT, w);
  assert.deepEqual([data.tasks[0].title, data.planningItems.find(i => i.id === item.id)!.title], ['Renamed task', 'Renamed task']);
  const subItem = plan.items.find(i => i.subtaskId === 1)!;
  p.updateItem(data, subItem.id, { title: 'Renamed sub' }, AT, w);
  assert.equal(data.tasks[1].subtasks[0].title, 'Renamed sub');
  const group = plan.groups.find(g => g.taskId === 2)!;
  p.updateGroup(data, group.id, { name: 'Renamed parent' }, AT, w);
  assert.equal(data.tasks[1].title, 'Renamed parent');
  // collapsing or other group edits never touch the task
  p.updateGroup(data, group.id, { collapsed: true }, AT, w);
  assert.equal(data.tasks[1].title, 'Renamed parent');
  // dangling
  data.tasks = data.tasks.filter(t => t.id !== 2);
  p.updateGroup(data, group.id, { name: 'Only the group' }, AT, w);
  assert.equal(data.planningGroups.find(g => g.id === group.id)!.name, 'Only the group');
});

test('standalone done toggle stores and restores progress', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P' }, AT, '2026-11-02');
  const item = p.createItem(data, { planningId: plan.id, title: 'x', progress: 50 }, AT);
  assert.equal(item.progressBeforeDone, null);
  p.updateItem(data, item.id, { progress: 100, progressBeforeDone: 50 }, AT);
  p.updateItem(data, item.id, { progress: 50, progressBeforeDone: null }, AT);
  assert.deepEqual([item.progress, item.progressBeforeDone], [50, null]);
  fails(() => p.updateItem(data, item.id, { progressBeforeDone: 120 }, AT), 400);
});

test('backfill only adds progressBeforeDone and never changes existing values', () => {
  const data = fixture([task(1, { deadline: '2026-11-12' })]);
  const plan = p.createPlanning(data, { name: 'P', sectionId: 1 }, AT, '2026-11-02');
  const item = data.planningItems[0];
  item.progress = 40; item.owner = 'Sam'; item.title = 'Manual title';
  delete (item as Partial<PlanningItem>).progressBeforeDone;
  const before = structuredClone(data);
  p.backfillPlanningData(data);
  assert.equal(data.planningItems[0].progressBeforeDone, null);
  delete (data.planningItems[0] as Partial<PlanningItem>).progressBeforeDone;
  assert.deepEqual(data, before);
  assert.equal(plan.id, data.plannings[0].id);
});

test('titleColumnWidth: default, validation, add-only backfill', () => {
  const data = fixture([]);
  const plan = p.createPlanning(data, { name: 'P' }, AT, '2026-11-02');
  assert.equal(plan.titleColumnWidth, 280);
  assert.equal(p.updatePlanning(data, plan.id, { titleColumnWidth: 420 }, AT).titleColumnWidth, 420);
  fails(() => p.updatePlanning(data, plan.id, { titleColumnWidth: 149 }, AT), 400);
  fails(() => p.updatePlanning(data, plan.id, { titleColumnWidth: 601 }, AT), 400);
  delete (data.plannings[0] as Partial<typeof data.plannings[0]>).titleColumnWidth;
  p.backfillPlanningData(data);
  assert.equal(data.plannings[0].titleColumnWidth, 280);
  data.plannings[0].titleColumnWidth = 333;
  p.backfillPlanningData(data);
  assert.equal(data.plannings[0].titleColumnWidth, 333, 'existing widths are kept');
});
