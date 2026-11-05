import type { PlanningDetail, PlanningGroup, PlanningItem, PlanningReorder, PlanningSegment, Priority, SubTask, Task } from '../types';
import { sortGroups } from './planningSort';

// Planning items are "linked but independent": a link is only read, never
// written. A taskId that no longer resolves behaves exactly like null.

export interface PlanningLink {
  task: Task;
  subtask: SubTask | null;
}

export function indexTasks(tasks: Task[] | undefined): Map<number, Task> {
  return new Map((tasks ?? []).map(t => [t.id, t]));
}

/** A group's priority: its live linked task's, else the stored value (standalone or dangling). */
export function groupPriority(group: PlanningGroup, tasksById: Map<number, Task>): Priority | null {
  const task = group.taskId != null ? tasksById.get(group.taskId) : undefined;
  return task ? task.priority : group.priority ?? null;
}

/** Click cycle of the group badge. Tasks have no "none", so linked groups skip it. */
export function nextGroupPriority(current: Priority | null, linked: boolean): Priority | null {
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'low';
  if (current === 'low') return linked ? 'high' : null;
  return 'high';
}

/** The live task (and subtask) behind an item, or null when standalone or dangling. */
export function resolvePlanningLink(item: PlanningItem, tasksById: Map<number, Task>): PlanningLink | null {
  if (item.taskId == null) return null;
  const task = tasksById.get(item.taskId);
  if (!task) return null;
  if (item.subtaskId == null) return { task, subtask: null };
  const subtask = task.subtasks?.find(s => s.id === item.subtaskId);
  return subtask ? { task, subtask } : null;
}

/** Live task/subtask title when the link resolves, else the stored snapshot. */
export function planningItemTitle(item: PlanningItem, tasksById: Map<number, Task>): string {
  const link = resolvePlanningLink(item, tasksById);
  return link ? (link.subtask?.title ?? link.task.title) : item.title;
}

/**
 * Linked: 100 if the task is done, else % of completed subtasks, else 0.
 * A subtask link counts as done when the subtask (or its parent) is done.
 * Standalone (or dangling): the stored progress.
 */
/**
 * Same "done" as the row checkbox: the linked task or subtask is done (a subtask
 * row also counts as done when its parent task is), or 100% for a standalone item.
 */
export function planningItemDone(item: PlanningItem, tasksById: Map<number, Task>): boolean {
  const link = resolvePlanningLink(item, tasksById);
  if (!link) return item.progress === 100;
  return link.task.status === 'done' || link.subtask?.status === 'done';
}

export function planningItemProgress(item: PlanningItem, tasksById: Map<number, Task>): number {
  const link = resolvePlanningLink(item, tasksById);
  if (!link) return item.progress;
  const { task, subtask } = link;
  if (task.status === 'done') return 100;
  if (subtask) return subtask.status === 'done' ? 100 : 0;
  if (!task.subtasks?.length) return 0;
  return Math.round(100 * task.subtasks.filter(s => s.status === 'done').length / task.subtasks.length);
}

/** Monday (YYYY-MM-DD) of the week containing `day`; UTC math avoids DST shifts. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Client-generated segment ids keep drag-created bars stable across the round trip. */
export function newSegmentId(): string {
  return crypto.randomUUID();
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "May 4, 2026" style (en-US like the rest of the app), read in UTC so a calendar day never shifts. */
export function formatPlanningDate(day: string, withYear = true): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric', month: 'short', ...(withYear && { year: 'numeric' }), timeZone: 'UTC',
  });
}

/** Monday of the first week → Sunday of the last week, e.g. "May 4 – Jun 28, 2026". */
export function formatPlanningRange(startDate: string, weekCount: number): string {
  const end = addDays(startDate, weekCount * 7 - 1);
  const sameYear = startDate.slice(0, 4) === end.slice(0, 4);
  return `${formatPlanningDate(startDate, !sameYear)} – ${formatPlanningDate(end)}`;
}

// ── Timeline geometry ─────────────────────────────────────────────────────────

export interface PlanningWeek {
  index: number;
  monday: string;
  label: string;        // "02/03" (day/month of the Monday)
  monthStart: boolean;  // first week whose Monday falls in a new month
}

/** Whole weeks from one Monday to another (negative when `to` is earlier). */
export function weeksBetween(fromMonday: string, toMonday: string): number {
  return Math.round((Date.parse(toMonday) - Date.parse(fromMonday)) / (7 * 86400000));
}

export function planningWeeks(startDate: string, weekCount: number): PlanningWeek[] {
  return Array.from({ length: weekCount }, (_, index) => {
    const monday = addDays(startDate, index * 7);
    const previous = index > 0 ? addDays(startDate, (index - 1) * 7) : null;
    return {
      index,
      monday,
      label: `${monday.slice(8, 10)}/${monday.slice(5, 7)}`,
      monthStart: previous !== null && previous.slice(0, 7) !== monday.slice(0, 7),
    };
  });
}

/** Consecutive weeks grouped by the month of their Monday, for the month header row. */
export function monthSpans(weeks: PlanningWeek[]): { key: string; label: string; start: number; span: number }[] {
  const spans: { key: string; label: string; start: number; span: number }[] = [];
  for (const week of weeks) {
    const key = week.monday.slice(0, 7);
    const last = spans[spans.length - 1];
    if (last?.key === key) { last.span += 1; continue; }
    const label = new Date(`${week.monday}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short', ...((spans.length === 0 || key.endsWith('-01')) && { year: 'numeric' }), timeZone: 'UTC',
    });
    spans.push({ key, label, start: week.index, span: 1 });
  }
  return spans;
}

/** Countdown label relative to the target week: S-3, S-2, S-1, S, S+1… */
export function countdownLabel(weekMonday: string, targetMonday: string): string {
  const diff = weeksBetween(targetMonday, weekMonday);
  return diff === 0 ? 'S' : diff < 0 ? `S${diff}` : `S+${diff}`;
}

/** Sunday that closes a week starting on `monday`. */
export function weekEnd(monday: string): string {
  return addDays(monday, 6);
}

export const PROGRESS_STEPS = [0, 25, 50, 75, 100] as const;

/** Next value in the 0/25/50/75/100 cycle (snaps arbitrary values up to the next step). */
export function nextProgressStep(progress: number): number {
  return PROGRESS_STEPS.find(step => step > progress) ?? 0;
}

/** Monday of the week at `index` (0 = startDate). */
export function weekMonday(startDate: string, index: number): string {
  return addDays(startDate, index * 7);
}

// ── Segment drag math (week indices relative to the planning start) ──────────
// Segments of one item never overlap: every drag is clamped to the free gap
// around the segment being edited, so it can never jump over a neighbour.

export interface WeekSpan { start: number; end: number }
export interface Gap { lo: number; hi: number }

/** Free interval containing [start, end], bounded by the row's other segments. */
export function freeGap(others: WeekSpan[], start: number, end: number): Gap {
  let lo = -Infinity;
  let hi = Infinity;
  for (const o of others) {
    if (o.end < start) lo = Math.max(lo, o.end + 1);
    else if (o.start > end) hi = Math.min(hi, o.start - 1);
    // Already-overlapping legacy data is ignored rather than blocking the drag.
  }
  return { lo, hi };
}

const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampMove(span: WeekSpan, delta: number, gap: Gap): WeekSpan {
  const length = span.end - span.start;
  const start = clampTo(span.start + delta, gap.lo, gap.hi - length);
  return { start, end: start + length };
}

export function clampResize(span: WeekSpan, edge: 'start' | 'end', to: number, gap: Gap): WeekSpan {
  return edge === 'start'
    ? { start: clampTo(to, gap.lo, span.end), end: span.end }
    : { start: span.start, end: clampTo(to, span.start, gap.hi) };
}

export function clampCreate(anchor: number, current: number, gap: Gap): WeekSpan {
  return { start: Math.max(Math.min(anchor, current), gap.lo), end: Math.min(Math.max(anchor, current), gap.hi) };
}

// ── Row reorder ───────────────────────────────────────────────────────────────

export type EntryKey = { kind: 'group' | 'item'; id: number };
/** Drop into `groupId` (null = root) just before `before` (null = at the end). */
export interface DropTarget { groupId: number | null; before: EntryKey | null }

const sameKey = (a: EntryKey | null, b: EntryKey | null) => !!a && !!b && a.kind === b.kind && a.id === b.id;

/** Entries of one container in display order; root mixes groups and root items. */
export function containerEntries(planning: Pick<PlanningDetail, 'groups' | 'items'>, groupId: number | null): (EntryKey & { order: number })[] {
  const items = planning.items.filter(i => i.groupId === groupId).map(i => ({ kind: 'item' as const, id: i.id, order: i.order }));
  const groups = groupId === null ? planning.groups.map(g => ({ kind: 'group' as const, id: g.id, order: g.order })) : [];
  return [...groups, ...items].sort((a, b) => a.order - b.order || (a.kind === 'group' ? -1 : 1));
}

/**
 * Root entries as displayed. Custom: groups and root items interleaved by
 * `order`. Deadline / priority: root items first (their own order), then the
 * groups as sortGroups() orders them. Never writes anything.
 */
export function rootDisplayEntries(planning: Pick<PlanningDetail, 'groups' | 'items' | 'groupSortMode'>, tasks: Iterable<Pick<Task, 'id' | 'priority'>>, groupIds?: number[]): EntryKey[] {
  const mode = planning.groupSortMode ?? 'custom';
  if (mode === 'custom') return containerEntries(planning, null).map(({ kind, id }) => ({ kind, id }));
  const items = containerEntries(planning, null).filter(e => e.kind === 'item').map(({ id }) => ({ kind: 'item' as const, id }));
  const ids = groupIds ?? sortGroups(planning.groups, planning.items, tasks, mode).map(g => g.id);
  return [...items, ...ids.map(id => ({ kind: 'group' as const, id }))];
}

/**
 * In a sorted mode, groups are not positioned by `order`, so a root-level item
 * dropped before a group (or at the end) goes after the last root item instead:
 * root items stay above the groups and the groups' relative order is kept.
 */
export function sortedModeDrop(planning: Pick<PlanningDetail, 'groups' | 'items' | 'groupSortMode'>, dragged: EntryKey, target: DropTarget): DropTarget {
  if ((planning.groupSortMode ?? 'custom') === 'custom' || dragged.kind !== 'item' || target.groupId !== null || target.before?.kind === 'item') return target;
  const entries = containerEntries(planning, null).filter(e => !sameKey(e, dragged));
  let last = -1;
  entries.forEach((e, i) => { if (e.kind === 'item') last = i; });
  const next = entries[last + 1];
  return { groupId: null, before: next ? { kind: next.kind, id: next.id } : null };
}

/** Bulk-reorder payload that makes the displayed root order the custom order. */
export function displayedOrderPayload(entries: EntryKey[]): PlanningReorder {
  return {
    groups: entries.flatMap((e, order) => (e.kind === 'group' ? [{ id: e.id, order }] : [])),
    items: entries.flatMap((e, order) => (e.kind === 'item' ? [{ id: e.id, order, groupId: null }] : [])),
  };
}

/**
 * Bulk-reorder payload for dropping `dragged` at `target`. Groups only live at
 * the root. Returns null when the drop changes nothing.
 */
export function computeReorder(planning: Pick<PlanningDetail, 'groups' | 'items'>, dragged: EntryKey, target: DropTarget): PlanningReorder | null {
  if (dragged.kind === 'group' && target.groupId !== null) return null;
  const sourceGroup = dragged.kind === 'item' ? planning.items.find(i => i.id === dragged.id)?.groupId ?? null : null;
  const list = containerEntries(planning, target.groupId);
  const withoutDragged = list.filter(e => !sameKey(e, dragged));
  // Dropping just before itself, or just after itself, is a no-op.
  if (sourceGroup === target.groupId) {
    const at = list.findIndex(e => sameKey(e, dragged));
    const next = list[at + 1] ?? null;
    if (sameKey(target.before, dragged) || (target.before === null ? next === null : sameKey(target.before, next))) return null;
  }
  const insertAt = target.before === null ? withoutDragged.length : withoutDragged.findIndex(e => sameKey(e, target.before));
  const ordered = [...withoutDragged];
  ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, { ...dragged, order: 0 });
  return {
    groups: ordered.flatMap((e, order) => (e.kind === 'group' ? [{ id: e.id, order }] : [])),
    items: ordered.flatMap((e, order) => (e.kind === 'item' ? [{ id: e.id, order, groupId: target.groupId }] : [])),
  };
}

// ── Planning <-> task deadline (mirrors server/src/db/planning.ts) ────────────

/** Monday of the latest segment end, or null without segments. */
export function lastSegmentEnd(segments: PlanningSegment[]): string | null {
  return segments.reduce<string | null>((max, s) => (max === null || s.end > max ? s.end : max), null);
}

/**
 * New task deadline after the last end week moved from `before` to `after`
 * (undefined = no change). Same rule as the server, used for optimistic updates.
 */
export function syncedDeadline(current: string | null, before: string | null, after: string | null): string | undefined {
  if (after === null || after === before) return undefined;
  const day = current && /^\d{4}-\d{2}-\d{2}/.test(current) ? current.slice(0, 10) : null;
  const next = day ? addDays(day, weeksBetween(before ?? mondayOf(day), after) * 7) : addDays(after, 4);
  return next === day ? undefined : next;
}

/** Only items linked to a whole task (not a subtask) take part in deadline sync. */
export function deadlineSyncTask(item: PlanningItem, tasksById: Map<number, Task>): Task | null {
  if (item.taskId === null || item.subtaskId !== null) return null;
  return tasksById.get(item.taskId) ?? null;
}

export type DeadlineIssue =
  | { kind: 'outside'; deadline: string; segment: PlanningSegment }
  | { kind: 'noBar'; deadline: string };

/** Task deadline outside the last bar's weeks, or a deadline with no bar at all. Never fixed automatically. */
export function deadlineIssue(item: PlanningItem, task: Task | null): DeadlineIssue | null {
  const deadline = task?.deadline?.slice(0, 10);
  if (!task || !deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  if (!item.segments.length) return { kind: 'noBar', deadline };
  const last = item.segments.reduce((a, b) => (b.end > a.end ? b : a));
  return deadline < last.start || deadline > weekEnd(last.end) ? { kind: 'outside', deadline, segment: last } : null;
}

/** The segment moved, keeping its length, so it ends on the deadline's week. */
export function alignedToDeadline(segment: PlanningSegment, deadline: string): { start: string; end: string } {
  const end = mondayOf(deadline);
  return { start: addDays(end, -7 * weeksBetween(segment.start, segment.end)), end };
}

/** "18/12" */
export function formatDayMonth(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** "Fri 18/12" */
export function formatWeekdayDayMonth(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${formatDayMonth(day)}`;
}
