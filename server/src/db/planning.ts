import { randomUUID } from 'crypto';
import { calendarDay } from './completion';
import type { Section, Task, Planning, PlanningDetail, PlanningSummary, PlanningGroup, PlanningItem, PlanningLegendEntry, PlanningSegment, DeadlineSync } from '../types';

// Links are resolved at read time and a dangling link behaves exactly like a
// standalone item. This module never writes data.tasks itself: the few edits
// that reach a real task (deadline sync from bars, renaming a linked row) go
// through a TaskWriter supplied by the database layer, which applies them with
// the same task logic as the Tasks page, inside the same save.

/** Task writes requested by planning actions; applied by the caller in the same transaction. */
export interface TaskWriter {
  setTaskFields(taskId: number, fields: { deadline?: string | null; title?: string }): void;
  setSubtaskTitle(taskId: number, subtaskId: number, title: string): void;
}

export class PlanningError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface PlanningData {
  sections: Section[];
  tasks: Task[];
  plannings: Planning[];
  planningGroups: PlanningGroup[];
  planningItems: PlanningItem[];
  _planningSeq: number;
  _planningGroupSeq: number;
  _planningItemSeq: number;
}

export const DEFAULT_LEGEND: PlanningLegendEntry[] = [
  { color: '#22c55e', label: 'Planned' },
  { color: '#3b82f6', label: 'In progress' },
];
const FALLBACK_COLOR = DEFAULT_LEGEND[0].color;
const MIN_WEEKS = 8;
const MAX_WEEKS = 520;
const MAX_TEXT = 200;
const MAX_SEGMENTS = 200;
export const DEFAULT_TITLE_WIDTH = 280;
const MIN_TITLE_WIDTH = 150;
const MAX_TITLE_WIDTH = 600;
export const GROUP_DELETE_MODES = ['deleteItems', 'moveToRoot'] as const;
export type GroupDeleteMode = typeof GROUP_DELETE_MODES[number];

const bad = (message: string): never => { throw new PlanningError(400, message); };
const missing = (what: string): never => { throw new PlanningError(404, `${what} not found`); };

// ── Dates ─────────────────────────────────────────────────────────────────────
// All planning dates are calendar days; UTC arithmetic avoids DST shifts.

export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function weeksBetween(fromMonday: string, toMonday: string): number {
  return Math.round((Date.parse(toMonday) - Date.parse(fromMonday)) / (7 * 86400000));
}

function taskDeadline(task: Task): string | null {
  const day = typeof task.deadline === 'string' ? task.deadline.slice(0, 10) : null;
  return day && calendarDay(day) ? day : null;
}

// ── Field parsers (unknown request input → validated value) ───────────────────

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) return bad(`${field} is required`);
  if (value.length > MAX_TEXT) return bad(`${field} must be under ${MAX_TEXT} characters`);
  return value.trim();
}
function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_TEXT) return bad(`invalid ${field}`);
  return value.trim() || null;
}
function day(value: unknown, field: string): string {
  return calendarDay(value) ? value : bad(`${field} must be a YYYY-MM-DD date`);
}
const monday = (value: unknown, field: string) => mondayOf(day(value, field));
function color(value: unknown): string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : bad('color must be a hex color');
}
function int(value: unknown, field: string, min: number, max: number): number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : bad(`${field} must be an integer between ${min} and ${max}`);
}
function nullableId(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : bad(`invalid ${field}`);
}
function legend(value: unknown): PlanningLegendEntry[] {
  if (!Array.isArray(value) || value.length > 20) return bad('legend must be an array of at most 20 entries');
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') return bad('invalid legend entry');
    const label = (entry as any).label;
    if (typeof label !== 'string' || label.length > 60) return bad('invalid legend label');
    return { color: color((entry as any).color), label };
  });
}
function highlightedWeeks(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_WEEKS) return bad('highlightedWeeks must be an array of dates');
  return [...new Set(value.map(v => monday(v, 'highlightedWeeks')))].sort();
}
function segment(value: unknown, defaultColor: string, existing?: PlanningSegment): PlanningSegment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('invalid segment');
  const v = value as Record<string, unknown>;
  const id = existing?.id ?? (v.id === undefined ? randomUUID()
    : typeof v.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.id) ? v.id : bad('invalid segment id'));
  const start = v.start !== undefined ? monday(v.start, 'start') : existing?.start ?? bad('start is required');
  const end = v.end !== undefined ? monday(v.end, 'end') : existing?.end ?? bad('end is required');
  if (end < start) bad('segment end must not be before start');
  return { id, start, end, color: v.color !== undefined ? color(v.color) : existing?.color ?? defaultColor };
}
function segments(value: unknown, defaultColor: string): PlanningSegment[] {
  if (!Array.isArray(value) || value.length > MAX_SEGMENTS) return bad(`segments must be an array of at most ${MAX_SEGMENTS}`);
  const parsed = value.map(v => segment(v, defaultColor));
  if (new Set(parsed.map(s => s.id)).size !== parsed.length) bad('duplicate segment id');
  return parsed;
}

// ── Lookups ───────────────────────────────────────────────────────────────────

function findPlanning(data: PlanningData, id: number): Planning {
  return data.plannings.find(p => p.id === id) ?? missing('Planning');
}
function findGroup(data: PlanningData, id: number): PlanningGroup {
  return data.planningGroups.find(g => g.id === id) ?? missing('Group');
}
function findItem(data: PlanningData, id: number): PlanningItem {
  return data.planningItems.find(i => i.id === id) ?? missing('Item');
}
function groupIn(data: PlanningData, planningId: number, groupId: unknown): number | null {
  const id = nullableId(groupId, 'groupId');
  if (id !== null && findGroup(data, id).planningId !== planningId) bad('group belongs to another planning');
  return id;
}
function defaultColor(planning: Planning): string {
  return planning.legend[0]?.color ?? FALLBACK_COLOR;
}
function touch(planning: Planning, at: string) {
  planning.updatedAt = at;
}

/** The live task (and subtask) behind a link, or undefined when it dangles. */
export function linkTarget(data: Pick<PlanningData, 'tasks'>, taskId: number | null, subtaskId: number | null) {
  if (taskId === null) return undefined;
  const task = data.tasks.find(t => t.id === taskId);
  if (!task) return undefined;
  if (subtaskId === null) return { task, title: task.title };
  const subtask = task.subtasks.find(s => s.id === subtaskId);
  return subtask ? { task, subtask, title: subtask.title } : undefined;
}

/** Root-level groups and items share one ordering space so the UI can interleave them. */
function nextOrder(data: PlanningData, planningId: number, groupId: number | null): number {
  const orders = data.planningItems.filter(i => i.planningId === planningId && i.groupId === groupId).map(i => i.order);
  if (groupId === null) orders.push(...data.planningGroups.filter(g => g.planningId === planningId).map(g => g.order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function newGroup(data: PlanningData, planningId: number, name: string, order: number, taskId: number | null = null): PlanningGroup {
  data._planningGroupSeq += 1;
  const group: PlanningGroup = { id: data._planningGroupSeq, planningId, taskId, name, order, collapsed: false };
  data.planningGroups.push(group);
  return group;
}
function newItem(data: PlanningData, fields: Omit<PlanningItem, 'id'>): PlanningItem {
  data._planningItemSeq += 1;
  const item: PlanningItem = { id: data._planningItemSeq, ...fields };
  data.planningItems.push(item);
  return item;
}

// ── Plannings ─────────────────────────────────────────────────────────────────

export function listPlannings(data: PlanningData): PlanningSummary[] {
  const counts = new Map<number, number>();
  data.planningItems.forEach(i => counts.set(i.planningId, (counts.get(i.planningId) ?? 0) + 1));
  return [...data.plannings]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(p => ({ ...p, itemCount: counts.get(p.id) ?? 0 }));
}

export function getPlanningDetail(data: PlanningData, id: number): PlanningDetail | undefined {
  const planning = data.plannings.find(p => p.id === id);
  if (!planning) return undefined;
  return {
    ...planning,
    groups: data.planningGroups.filter(g => g.planningId === id).sort((a, b) => a.order - b.order),
    items: data.planningItems.filter(i => i.planningId === id).sort((a, b) => a.order - b.order)
      // A dangling link is reported as standalone; the stored snapshot title stays.
      .map(i => linkTarget(data, i.taskId, i.subtaskId) || i.taskId === null ? i : { ...i, taskId: null, subtaskId: null }),
  };
}

export function createPlanning(data: PlanningData, body: Record<string, unknown>, at: string, today: string): PlanningDetail {
  const name = text(body.name, 'name');
  const sectionId = nullableId(body.sectionId, 'sectionId');
  if (sectionId !== null && !data.sections.some(s => s.id === sectionId)) missing('Section');
  const startDate = body.startDate === undefined || body.startDate === null ? mondayOf(today) : monday(body.startDate, 'startDate');
  const targetDate = body.targetDate === undefined || body.targetDate === null ? null : day(body.targetDate, 'targetDate');
  data._planningSeq += 1;
  const planning: Planning = {
    id: data._planningSeq, name, sectionId, startDate, weekCount: MIN_WEEKS, targetDate,
    highlightedWeeks: [], legend: structuredClone(DEFAULT_LEGEND), ignoredTaskIds: [], titleColumnWidth: DEFAULT_TITLE_WIDTH, createdAt: at, updatedAt: at,
  };
  data.plannings.push(planning);
  if (sectionId !== null) importSection(data, planning);
  return getPlanningDetail(data, planning.id)!;
}

/** Deadline order, no deadline last; ties by creation. */
function byDeadline(a: Task, b: Task): number {
  const da = taskDeadline(a), db = taskDeadline(b);
  if (da !== db) return da === null ? 1 : db === null ? -1 : da.localeCompare(db);
  return a.created_at.localeCompare(b.created_at) || a.id - b.id;
}

/** Weeks needed to show `deadline`'s week plus a two-week margin. */
function weeksToCover(planning: Planning, deadline: string): number {
  return Math.min(MAX_WEEKS, weeksBetween(planning.startDate, mondayOf(deadline)) + 1 + 2);
}

/**
 * The one task -> planning conversion, shared by the section import and
 * import-tasks. A task with subtasks becomes a root group (groups are one level
 * deep, so `groupId` is ignored) holding one linked item per subtask; any other
 * task becomes one linked item at the end of `groupId` (null = root). Items get
 * one segment on the deadline's week in the first legend color, or none.
 */
function convertTask(data: PlanningData, planning: Planning, task: Task, groupId: number | null) {
  const deadline = taskDeadline(task);
  const fill = defaultColor(planning);
  const segments = (): PlanningSegment[] =>
    deadline ? [{ id: randomUUID(), start: mondayOf(deadline), end: mondayOf(deadline), color: fill }] : [];
  const base = { planningId: planning.id, owner: null, progress: 0, progressBeforeDone: null };
  if (task.subtasks?.length) {
    const group = newGroup(data, planning.id, task.title, nextOrder(data, planning.id, null), task.id);
    task.subtasks.forEach((sub, order) => {
      const linked = Number.isSafeInteger(sub.id);
      newItem(data, { ...base, groupId: group.id, taskId: linked ? task.id : null, subtaskId: linked ? sub.id : null,
        title: sub.title, order, segments: segments() });
    });
  } else {
    newItem(data, { ...base, groupId, taskId: task.id, subtaskId: null, title: task.title,
      order: nextOrder(data, planning.id, groupId), segments: segments() });
  }
  return deadline;
}

/** Seeds a new planning from every task (active and done) of its section. */
function importSection(data: PlanningData, planning: Planning) {
  const tasks = data.tasks.filter(t => t.section_id === planning.sectionId).sort(byDeadline);
  // Only placement differs from import-tasks: undated plain tasks share an "Unscheduled" group.
  const unscheduled = tasks.filter(t => !t.subtasks?.length && !taskDeadline(t));
  let latest: string | null = null;
  for (const task of tasks) {
    if (unscheduled.includes(task)) continue;
    const deadline = convertTask(data, planning, task, null);
    if (deadline && (!latest || deadline > latest)) latest = deadline;
  }
  if (unscheduled.length) {
    const group = newGroup(data, planning.id, 'Unscheduled', nextOrder(data, planning.id, null));
    unscheduled.forEach(task => convertTask(data, planning, task, group.id));
  }
  if (latest) planning.weekCount = Math.max(MIN_WEEKS, weeksToCover(planning, latest));
}

// -- Missing / ignored section tasks --------------------------------------------

/** A task is present when an item or a group carries its id. */
function presentTaskIds(data: PlanningData, planningId: number): Set<number> {
  const ids = new Set<number>();
  data.planningItems.forEach(i => { if (i.planningId === planningId && i.taskId !== null) ids.add(i.taskId); });
  data.planningGroups.forEach(g => { if (g.planningId === planningId && g.taskId !== null) ids.add(g.taskId); });
  return ids;
}

function ignoreTask(planning: Planning, taskId: number) {
  if (!planning.ignoredTaskIds.includes(taskId)) planning.ignoredTaskIds = [...planning.ignoredTaskIds, taskId].sort((a, b) => a - b);
}

/** Section tasks (active and done) not yet in the planning and not ignored, by deadline. */
export function missingTasks(data: PlanningData, id: number): Task[] {
  const planning = findPlanning(data, id);
  if (planning.sectionId === null) return [];
  const present = presentTaskIds(data, id);
  const ignored = new Set(planning.ignoredTaskIds);
  return data.tasks
    .filter(t => t.section_id === planning.sectionId && !present.has(t.id) && !ignored.has(t.id))
    .sort(byDeadline);
}

/**
 * Body: [{ taskId, groupId }]. Everything is validated before anything is
 * written. Tasks already present are skipped (a retry never duplicates), and an
 * imported task is no longer ignored. The planning grows to show new deadlines.
 */
export function importTasks(data: PlanningData, id: number, body: unknown, at: string): { planning: PlanningDetail; skipped: number[] } {
  const planning = findPlanning(data, id);
  if (!Array.isArray(body) || body.length === 0 || body.length > 500) bad('body must be a non-empty array of { taskId, groupId }');
  const entries = (body as unknown[]).map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return bad('invalid import entry');
    const e = entry as Record<string, unknown>;
    const taskId = nullableId(e.taskId, 'taskId') ?? bad('taskId is required');
    const task = data.tasks.find(t => t.id === taskId) ?? missing('Task');
    return { task, groupId: groupIn(data, planning.id, e.groupId) };
  });
  const present = presentTaskIds(data, planning.id);
  const skipped: number[] = [];
  const imported = new Set<number>();
  let latest: string | null = null;
  for (const { task, groupId } of entries) {
    if (present.has(task.id) || imported.has(task.id)) { skipped.push(task.id); continue; }
    imported.add(task.id);
    const deadline = convertTask(data, planning, task, groupId);
    if (deadline && (!latest || deadline > latest)) latest = deadline;
  }
  planning.ignoredTaskIds = planning.ignoredTaskIds.filter(t => !imported.has(t));
  if (latest) planning.weekCount = Math.max(planning.weekCount, weeksToCover(planning, latest));
  touch(planning, at);
  return { planning: getPlanningDetail(data, planning.id)!, skipped };
}

/** Body: [taskId]. Ids are kept even if the task is later deleted (harmless). */
export function ignoreTasks(data: PlanningData, id: number, body: unknown, at: string): Planning {
  const planning = findPlanning(data, id);
  if (!Array.isArray(body) || body.length > 1000) bad('body must be an array of task ids');
  const ids = (body as unknown[]).map(v => nullableId(v, 'taskId') ?? bad('invalid taskId'));
  ids.forEach(taskId => ignoreTask(planning, taskId));
  touch(planning, at);
  return planning;
}

export function clearIgnoredTasks(data: PlanningData, id: number, at: string): Planning {
  const planning = findPlanning(data, id);
  planning.ignoredTaskIds = [];
  touch(planning, at);
  return planning;
}

/**
 * Migration for data written before ignoredTaskIds / group taskId existed.
 * A group gets the id of the single task with subtasks in the planning's
 * section whose title equals the group name; ambiguous or no match -> null.
 * Idempotent: groups that already have a taskId field are left alone.
 */
export function backfillPlanningData(data: PlanningData) {
  for (const p of data.plannings) if (!Array.isArray(p.ignoredTaskIds)) p.ignoredTaskIds = [];
  for (const p of data.plannings) if (p.titleColumnWidth === undefined) p.titleColumnWidth = DEFAULT_TITLE_WIDTH;
  // Only adds the field; existing values (progress, segments, titles...) are never touched.
  for (const i of data.planningItems) if (i.progressBeforeDone === undefined) i.progressBeforeDone = null;
  for (const g of data.planningGroups) {
    if (g.taskId !== undefined) continue;
    const planning = data.plannings.find(p => p.id === g.planningId);
    const sectionId = planning?.sectionId ?? null;
    const matches = sectionId === null ? []
      : data.tasks.filter(t => t.section_id === sectionId && t.subtasks?.length && t.title === g.name);
    g.taskId = matches.length === 1 ? matches[0].id : null;
  }
}

export function updatePlanning(data: PlanningData, id: number, body: Record<string, unknown>, at: string): Planning {
  const planning = findPlanning(data, id);
  const next = { ...planning };
  if (body.name !== undefined) next.name = text(body.name, 'name');
  if (body.sectionId !== undefined) {
    next.sectionId = nullableId(body.sectionId, 'sectionId');
    if (next.sectionId !== null && !data.sections.some(s => s.id === next.sectionId)) missing('Section');
  }
  if (body.startDate !== undefined) next.startDate = monday(body.startDate, 'startDate');
  if (body.weekCount !== undefined) next.weekCount = int(body.weekCount, 'weekCount', 1, MAX_WEEKS);
  if (body.targetDate !== undefined) next.targetDate = body.targetDate === null ? null : day(body.targetDate, 'targetDate');
  if (body.highlightedWeeks !== undefined) next.highlightedWeeks = highlightedWeeks(body.highlightedWeeks);
  if (body.legend !== undefined) next.legend = legend(body.legend);
  if (body.titleColumnWidth !== undefined) next.titleColumnWidth = int(body.titleColumnWidth, 'titleColumnWidth', MIN_TITLE_WIDTH, MAX_TITLE_WIDTH);
  Object.assign(planning, next);
  touch(planning, at);
  return planning;
}

export function deletePlanning(data: PlanningData, id: number): void {
  findPlanning(data, id);
  data.plannings = data.plannings.filter(p => p.id !== id);
  data.planningGroups = data.planningGroups.filter(g => g.planningId !== id);
  data.planningItems = data.planningItems.filter(i => i.planningId !== id);
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function createGroup(data: PlanningData, body: Record<string, unknown>, at: string): PlanningGroup {
  const planning = findPlanning(data, nullableId(body.planningId, 'planningId') ?? bad('planningId is required'));
  const group = newGroup(data, planning.id, text(body.name, 'name'), nextOrder(data, planning.id, null));
  if (body.collapsed !== undefined) group.collapsed = Boolean(body.collapsed);
  touch(planning, at);
  return group;
}

export function updateGroup(data: PlanningData, id: number, body: Record<string, unknown>, at: string, tasks?: TaskWriter): PlanningGroup {
  const group = findGroup(data, id);
  const next = { ...group };
  if (body.name !== undefined) {
    next.name = text(body.name, 'name');
    // A group made from a task renames that task too; a dangling link only renames the group.
    if (tasks && group.taskId !== null && data.tasks.some(t => t.id === group.taskId)) tasks.setTaskFields(group.taskId, { title: next.name });
  }
  if (body.collapsed !== undefined) next.collapsed = Boolean(body.collapsed);
  if (body.order !== undefined) next.order = int(body.order, 'order', 0, Number.MAX_SAFE_INTEGER);
  Object.assign(group, next);
  touch(findPlanning(data, group.planningId), at);
  return group;
}

export function deleteGroup(data: PlanningData, id: number, mode: unknown, at: string): void {
  if (!GROUP_DELETE_MODES.includes(mode as GroupDeleteMode)) bad(`mode must be one of: ${GROUP_DELETE_MODES.join(', ')}`);
  const group = findGroup(data, id);
  const planning = findPlanning(data, group.planningId);
  const members = data.planningItems.filter(i => i.groupId === id).sort((a, b) => a.order - b.order);
  // Deleting what came from a task means "don't suggest it again".
  if (group.taskId !== null) ignoreTask(planning, group.taskId);
  if (mode === 'deleteItems') {
    members.forEach(i => { if (i.taskId !== null) ignoreTask(planning, i.taskId); });
    data.planningItems = data.planningItems.filter(i => i.groupId !== id);
  } else {
    let order = nextOrder(data, group.planningId, null);
    members.forEach(item => { item.groupId = null; item.order = order++; });
  }
  data.planningGroups = data.planningGroups.filter(g => g.id !== id);
  touch(planning, at);
}

// ── Items ─────────────────────────────────────────────────────────────────────

function link(data: PlanningData, taskId: unknown, subtaskId: unknown) {
  const ids = { taskId: nullableId(taskId, 'taskId'), subtaskId: nullableId(subtaskId, 'subtaskId') };
  if (ids.taskId === null) return { taskId: null, subtaskId: null, title: undefined };
  const target = linkTarget(data, ids.taskId, ids.subtaskId) ?? missing(ids.subtaskId === null ? 'Task' : 'Subtask');
  return { ...ids, title: target.title };
}

export function createItem(data: PlanningData, body: Record<string, unknown>, at: string): PlanningItem {
  const planning = findPlanning(data, nullableId(body.planningId, 'planningId') ?? bad('planningId is required'));
  const groupId = groupIn(data, planning.id, body.groupId);
  const linked = link(data, body.taskId, body.subtaskId);
  const item = newItem(data, {
    planningId: planning.id, groupId, taskId: linked.taskId, subtaskId: linked.subtaskId,
    title: body.title !== undefined || !linked.title ? text(body.title, 'title') : linked.title,
    owner: optionalText(body.owner, 'owner'),
    progress: body.progress === undefined ? 0 : int(body.progress, 'progress', 0, 100),
    progressBeforeDone: null,
    order: nextOrder(data, planning.id, groupId),
    segments: body.segments === undefined ? [] : segments(body.segments, defaultColor(planning)),
  });
  touch(planning, at);
  return item;
}

export function updateItem(data: PlanningData, id: number, body: Record<string, unknown>, at: string, tasks?: TaskWriter): PlanningItem {
  const item = findItem(data, id);
  const planning = findPlanning(data, item.planningId);
  const next = { ...item };
  if (body.taskId !== undefined || body.subtaskId !== undefined) {
    const linked = link(data, body.taskId !== undefined ? body.taskId : item.taskId, body.subtaskId !== undefined ? body.subtaskId : null);
    next.taskId = linked.taskId;
    next.subtaskId = linked.subtaskId;
    if (linked.title && body.title === undefined) next.title = linked.title;
  }
  if (body.title !== undefined) {
    next.title = text(body.title, 'title');
    // Linked rows rename the real task (or subtask) and keep the snapshot in step.
    const target = tasks ? linkTarget(data, next.taskId, next.subtaskId) : undefined;
    if (target?.subtask) tasks!.setSubtaskTitle(target.task.id, target.subtask.id, next.title);
    else if (target) tasks!.setTaskFields(target.task.id, { title: next.title });
  }
  if (body.owner !== undefined) next.owner = optionalText(body.owner, 'owner');
  if (body.progress !== undefined) next.progress = int(body.progress, 'progress', 0, 100);
  if (body.progressBeforeDone !== undefined) next.progressBeforeDone = body.progressBeforeDone === null ? null : int(body.progressBeforeDone, 'progressBeforeDone', 0, 100);
  if (body.segments !== undefined) next.segments = segments(body.segments, defaultColor(planning));
  if (body.groupId !== undefined) {
    next.groupId = groupIn(data, planning.id, body.groupId);
    if (next.groupId !== item.groupId && body.order === undefined) next.order = nextOrder(data, planning.id, next.groupId);
  }
  if (body.order !== undefined) next.order = int(body.order, 'order', 0, Number.MAX_SAFE_INTEGER);
  Object.assign(item, next);
  touch(planning, at);
  return item;
}

export function deleteItem(data: PlanningData, id: number, at: string): void {
  const item = findItem(data, id);
  const planning = findPlanning(data, item.planningId);
  if (item.taskId !== null) ignoreTask(planning, item.taskId);
  data.planningItems = data.planningItems.filter(i => i.id !== id);
  touch(planning, at);
}

// ── Segments (granular so concurrent drags on one item never overwrite each other) ──

// ── Deadline sync (planning -> task) ──────────────────────────────────────────
// A linked item's "planning deadline" is the end week of its last segment.
// Only a user's segment action that moves that week updates the task; nothing
// is ever recomputed from existing bars.

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the latest segment end, or null without segments. */
export function lastSegmentEnd(segments: PlanningSegment[]): string | null {
  return segments.reduce<string | null>((max, s) => (max === null || s.end > max ? s.end : max), null);
}

/**
 * New task deadline after the last end week moved from `before` to `after`, or
 * undefined when nothing should change. An existing deadline shifts by the same
 * number of weeks (keeping its weekday; with no previous bar it moves into the
 * new week); a missing one becomes that week's Friday. Losing every bar never
 * clears the deadline.
 */
export function syncedDeadline(current: string | null, before: string | null, after: string | null): string | undefined {
  if (after === null || after === before) return undefined;
  const day = current && calendarDay(current.slice(0, 10)) ? current.slice(0, 10) : null;
  const next = day ? addDays(day, weeksBetween(before ?? mondayOf(day), after) * 7) : addDays(after, 4);
  return next === day ? undefined : next;
}

/** Applies the sync for one item after its segments changed; tasks linked to subtasks are skipped. */
function syncDeadline(data: PlanningData, item: PlanningItem, before: PlanningSegment[], tasks: TaskWriter | undefined, enabled: boolean): DeadlineSync | null {
  if (!tasks || !enabled || item.taskId === null || item.subtaskId !== null) return null;
  const task = data.tasks.find(t => t.id === item.taskId);
  if (!task) return null;
  const to = syncedDeadline(task.deadline, lastSegmentEnd(before), lastSegmentEnd(item.segments));
  if (to === undefined) return null;
  const from = task.deadline;
  tasks.setTaskFields(task.id, { deadline: to });
  return { taskId: task.id, from, to };
}

/** `syncDeadline: false` in a body marks a local-only change (align bar, add bar on deadline). */
const wantsSync = (body: unknown) => !(body && typeof body === 'object' && (body as Record<string, unknown>).syncDeadline === false);

export type SegmentResult = { item: PlanningItem; deadlineSync: DeadlineSync | null };

export function addSegment(data: PlanningData, itemId: number, body: unknown, at: string, tasks?: TaskWriter): SegmentResult {
  const item = findItem(data, itemId);
  const planning = findPlanning(data, item.planningId);
  if (item.segments.length >= MAX_SEGMENTS) bad(`an item has at most ${MAX_SEGMENTS} segments`);
  const created = segment(body, defaultColor(planning));
  if (item.segments.some(s => s.id === created.id)) throw new PlanningError(409, 'segment id already exists');
  const before = item.segments;
  item.segments = [...item.segments, created];
  touch(planning, at);
  return { item, deadlineSync: syncDeadline(data, item, before, tasks, wantsSync(body)) };
}

export function updateSegment(data: PlanningData, itemId: number, segmentId: string, body: unknown, at: string, tasks?: TaskWriter): SegmentResult {
  const item = findItem(data, itemId);
  const planning = findPlanning(data, item.planningId);
  const existing = item.segments.find(s => s.id === segmentId) ?? missing('Segment');
  const updated = segment(body, defaultColor(planning), existing);
  const before = item.segments;
  item.segments = item.segments.map(s => s.id === segmentId ? updated : s);
  touch(planning, at);
  return { item, deadlineSync: syncDeadline(data, item, before, tasks, wantsSync(body)) };
}

export function deleteSegment(data: PlanningData, itemId: number, segmentId: string, at: string, tasks?: TaskWriter): SegmentResult {
  const item = findItem(data, itemId);
  if (!item.segments.some(s => s.id === segmentId)) missing('Segment');
  const before = item.segments;
  item.segments = item.segments.filter(s => s.id !== segmentId);
  touch(findPlanning(data, item.planningId), at);
  return { item, deadlineSync: syncDeadline(data, item, before, tasks, true) };
}

/**
 * Undo of a synced segment action: puts one segment back as it was (null = it
 * did not exist) and restores the task deadline, atomically and without
 * triggering another sync. Body: { segmentId, segment: {...} | null, deadline }.
 */
export function revertSegment(data: PlanningData, itemId: number, body: unknown, at: string, tasks?: TaskWriter): PlanningItem {
  const item = findItem(data, itemId);
  const planning = findPlanning(data, item.planningId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid body');
  const b = body as Record<string, unknown>;
  if (typeof b.segmentId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.segmentId)) bad('segmentId is required');
  const segmentId = b.segmentId as string;
  if (b.segment === null) {
    item.segments = item.segments.filter(s => s.id !== segmentId);
  } else {
    const restored = segment({ ...(b.segment as object), id: segmentId }, defaultColor(planning));
    item.segments = item.segments.some(s => s.id === segmentId)
      ? item.segments.map(s => (s.id === segmentId ? restored : s))
      : [...item.segments, restored];
  }
  if (b.deadline !== undefined && tasks && item.taskId !== null && item.subtaskId === null && data.tasks.some(t => t.id === item.taskId)) {
    tasks.setTaskFields(item.taskId, { deadline: b.deadline === null ? null : day(b.deadline, 'deadline') });
  }
  touch(planning, at);
  return item;
}

// ── Bulk reorder ──────────────────────────────────────────────────────────────

export function reorderPlanning(data: PlanningData, planningId: number, body: Record<string, unknown>, at: string): void {
  const planning = findPlanning(data, planningId);
  const entries = (value: unknown, field: string) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 5000) return bad(`${field} must be an array`);
    return value.map(v => (v && typeof v === 'object' ? v : bad(`invalid ${field} entry`)) as Record<string, unknown>);
  };
  // Validate everything before applying anything: a reorder is all or nothing.
  const groups = entries(body.groups, 'groups').map(g => {
    const group = findGroup(data, nullableId(g.id, 'id') ?? bad('id is required'));
    if (group.planningId !== planningId) bad('group belongs to another planning');
    return { group, order: int(g.order, 'order', 0, Number.MAX_SAFE_INTEGER) };
  });
  const items = entries(body.items, 'items').map(i => {
    const item = findItem(data, nullableId(i.id, 'id') ?? bad('id is required'));
    if (item.planningId !== planningId) bad('item belongs to another planning');
    return { item, order: int(i.order, 'order', 0, Number.MAX_SAFE_INTEGER), groupId: i.groupId === undefined ? item.groupId : groupIn(data, planningId, i.groupId) };
  });
  groups.forEach(({ group, order }) => { group.order = order; });
  items.forEach(({ item, order, groupId }) => { item.order = order; item.groupId = groupId; });
  touch(planning, at);
}

// ── Hooks called from other features ─────────────────────────────────────────

/**
 * Called before a task (or one of its subtasks) is deleted: linked items keep a
 * fresh snapshot title and their last computed progress, then become standalone.
 */
export function detachDeletedTask(data: PlanningData, taskId: number, subtaskId?: number) {
  const at = new Date().toISOString();
  for (const item of data.planningItems) {
    if (item.taskId !== taskId || (subtaskId !== undefined && item.subtaskId !== subtaskId)) continue;
    const target = linkTarget(data, item.taskId, item.subtaskId);
    if (target) {
      item.title = target.title;
      item.progress = target.subtask ? (target.subtask.status === 'done' ? 100 : 0) : taskProgress(target.task);
    }
    item.taskId = null;
    item.subtaskId = null;
    const planning = data.plannings.find(p => p.id === item.planningId);
    if (planning) touch(planning, at);
  }
}

export function detachDeletedSection(data: PlanningData, sectionId: number) {
  data.plannings.forEach(p => { if (p.sectionId === sectionId) p.sectionId = null; });
}

// ── Read-only views of an item (same rules as client/src/utils/planning.ts) ──

/** Live task/subtask title when the link resolves, else the stored snapshot. */
export function itemTitle(tasks: Task[], item: PlanningItem): string {
  return linkTarget({ tasks }, item.taskId, item.subtaskId)?.title ?? item.title;
}

/** Linked: 100 when the task is done, subtask rows follow their subtask, else % of done subtasks. Standalone: stored progress. */
export function itemProgress(tasks: Task[], item: PlanningItem): number {
  const target = linkTarget({ tasks }, item.taskId, item.subtaskId);
  if (!target) return item.progress;
  if (target.task.status === 'done') return 100;
  if (target.subtask) return target.subtask.status === 'done' ? 100 : 0;
  return taskProgress(target.task);
}

/** Same "done" as the row checkbox: the linked task/subtask (or its done parent), else 100% for standalone items. */
export function itemDone(tasks: Task[], item: PlanningItem): boolean {
  const target = linkTarget({ tasks }, item.taskId, item.subtaskId);
  if (!target) return item.progress === 100;
  return target.task.status === 'done' || target.subtask?.status === 'done';
}

/** Same rule as the client helper: done → 100, else % of done subtasks, else 0. */
export function taskProgress(task: Task): number {
  if (task.status === 'done') return 100;
  if (!task.subtasks?.length) return 0;
  return Math.round(100 * task.subtasks.filter(s => s.status === 'done').length / task.subtasks.length);
}
