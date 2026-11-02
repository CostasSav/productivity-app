import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampCreate, clampMove, clampResize, computeReorder, freeGap, weekMonday } from '../src/utils/planning';
import type { PlanningGroup, PlanningItem } from '../src/types';

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
  ({ id, planningId: 1, groupId, taskId: null, subtaskId: null, title: `i${id}`, owner: null, progress: 0, order, segments: [] });
const group = (id: number, order: number): PlanningGroup => ({ id, planningId: 1, name: `g${id}`, order, collapsed: false });
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
