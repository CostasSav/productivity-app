import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as p from '../src/db/planning';
import type { Task } from '../src/types';

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
