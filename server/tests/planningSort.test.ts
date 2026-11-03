import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { sortGroups } from '../src/db/planningSort';
import * as p from '../src/db/planning';

const group = (id: number, order: number, priority: 'high' | 'medium' | 'low' | null = null, taskId: number | null = null) =>
  ({ id, planningId: 1, taskId, name: `G${id}`, order, collapsed: false, priority });
const item = (groupId: number | null, ...ends: string[]) => ({ groupId, segments: ends.map(end => ({ end })) });
const ids = (gs: { id: number }[]) => gs.map(g => g.id);

test('client and server copies of the sort module are identical below the header', () => {
  const body = (file: string) => {
    const text = readFileSync(path.join(__dirname, '..', '..', file), 'utf8').replace(/\r\n/g, '\n');
    return text.slice(text.indexOf('// ---- shared code below ----'));
  };
  assert.equal(body('client/src/utils/planningSort.ts'), body('server/src/db/planningSort.ts'));
});

test('custom keeps order; deadline and priority follow the tie-break rules', () => {
  const groups = [
    group(1, 0, 'low'),             // deadline 11-09
    group(2, 1, null),              // no deadline
    group(3, 2, 'high'),            // deadline 11-23
    group(4, 3, 'medium'),          // deadline 11-09 (ties with 1 -> priority)
    group(5, 4, 'high'),            // no deadline
    group(6, 5, null),              // deadline 11-23 (ties with 3 -> priority)
  ];
  const items = [item(1, '2026-11-02', '2026-11-09'), item(3, '2026-11-23'), item(4, '2026-11-09'), item(6, '2026-11-16'), item(6, '2026-11-23'), item(null, '2026-01-05'), item(2)];
  const shuffled = [groups[3], groups[0], groups[5], groups[2], groups[4], groups[1]];
  assert.deepEqual(ids(sortGroups(shuffled, items, [], 'custom')), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ids(sortGroups(shuffled, items, [], 'deadline')), [4, 1, 3, 6, 5, 2]);
  assert.deepEqual(ids(sortGroups(shuffled, items, [], 'priority')), [3, 5, 4, 1, 6, 2]);
  // equal on everything -> order
  assert.deepEqual(ids(sortGroups([group(8, 9), group(7, 3)], [], [], 'priority')), [7, 8]);
  // pure: input order and `order` fields untouched
  assert.deepEqual(ids(shuffled), [4, 1, 6, 3, 5, 2]);
  assert.deepEqual(groups.map(g => g.order), [0, 1, 2, 3, 4, 5]);
});

test('a linked group sorts by its live task priority; a dangling one by its stored value', () => {
  const groups = [group(1, 0, 'high', 50), group(2, 1, 'medium')];
  assert.deepEqual(ids(sortGroups(groups, [], [{ id: 50, priority: 'low' }], 'priority')), [2, 1]);
  assert.deepEqual(ids(sortGroups(groups, [], [], 'priority')), [1, 2]);
});

test('groupSortMode: default, PATCH validation, add-only backfill, never rewrites order', () => {
  const data: p.PlanningData = {
    sections: [], tasks: [], plannings: [], planningGroups: [], planningItems: [], _planningSeq: 0, _planningGroupSeq: 0, _planningItemSeq: 0,
  };
  const AT = '2026-11-02T10:00:00.000Z';
  const plan = p.createPlanning(data, { name: 'P' }, AT, '2026-11-02');
  assert.equal(plan.groupSortMode, 'custom');
  p.createGroup(data, { planningId: plan.id, name: 'A' }, AT);
  p.createGroup(data, { planningId: plan.id, name: 'B' }, AT);
  p.updateGroup(data, 2, { priority: 'high' }, AT);
  const orders = data.planningGroups.map(g => g.order);
  for (const mode of ['priority', 'deadline', 'custom'] as const) {
    assert.equal(p.updatePlanning(data, plan.id, { groupSortMode: mode }, AT).groupSortMode, mode);
    assert.deepEqual(data.planningGroups.map(g => g.order), orders);
  }
  assert.throws(() => p.updatePlanning(data, plan.id, { groupSortMode: 'name' }, AT), (e: unknown) => e instanceof p.PlanningError && e.status === 400);
  delete (data.plannings[0] as Partial<p.PlanningData['plannings'][0]>).groupSortMode;
  p.backfillPlanningData(data);
  assert.equal(data.plannings[0].groupSortMode, 'custom');
  data.plannings[0].groupSortMode = 'priority';
  p.backfillPlanningData(data);
  assert.equal(data.plannings[0].groupSortMode, 'priority', 'existing modes are kept');
});
