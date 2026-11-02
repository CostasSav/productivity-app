import { randomUUID } from 'crypto';
import { calendarDay } from './completion';
import type { Section, Task, Planning, PlanningDetail, PlanningSummary, PlanningGroup, PlanningItem, PlanningLegendEntry, PlanningSegment } from '../types';

// Planning items are "linked but independent": nothing in this module ever
// writes to data.tasks. Links are resolved at read time and a dangling link
// behaves exactly like a standalone item.

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

function weeksBetween(fromMonday: string, toMonday: string): number {
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

function newGroup(data: PlanningData, planningId: number, name: string, order: number): PlanningGroup {
  data._planningGroupSeq += 1;
  const group: PlanningGroup = { id: data._planningGroupSeq, planningId, name, order, collapsed: false };
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
    highlightedWeeks: [], legend: structuredClone(DEFAULT_LEGEND), createdAt: at, updatedAt: at,
  };
  data.plannings.push(planning);
  if (sectionId !== null) importSection(data, planning);
  return getPlanningDetail(data, planning.id)!;
}

/** Seeds a new planning from every task (active and done) of its section. */
function importSection(data: PlanningData, planning: Planning) {
  const tasks = data.tasks.filter(t => t.section_id === planning.sectionId).sort((a, b) => {
    const da = taskDeadline(a), db = taskDeadline(b);
    if (da !== db) return da === null ? 1 : db === null ? -1 : da.localeCompare(db);
    return a.created_at.localeCompare(b.created_at) || a.id - b.id;
  });
  const fill = defaultColor(planning);
  const segmentsFor = (deadline: string | null): PlanningSegment[] =>
    deadline ? [{ id: randomUUID(), start: mondayOf(deadline), end: mondayOf(deadline), color: fill }] : [];
  const base = { planningId: planning.id, owner: null, progress: 0 };
  let rootOrder = 0;
  const unscheduled: Task[] = [];
  let latest: string | null = null;
  for (const task of tasks) {
    const deadline = taskDeadline(task);
    if (deadline && (!latest || deadline > latest)) latest = deadline;
    if (task.subtasks?.length) {
      const group = newGroup(data, planning.id, task.title, rootOrder++);
      task.subtasks.forEach((sub, order) => {
        const linked = Number.isSafeInteger(sub.id);
        newItem(data, { ...base, groupId: group.id, taskId: linked ? task.id : null, subtaskId: linked ? sub.id : null,
          title: sub.title, order, segments: segmentsFor(deadline) });
      });
    } else if (deadline) {
      newItem(data, { ...base, groupId: null, taskId: task.id, subtaskId: null, title: task.title, order: rootOrder++, segments: segmentsFor(deadline) });
    } else unscheduled.push(task);
  }
  if (unscheduled.length) {
    const group = newGroup(data, planning.id, 'Unscheduled', rootOrder++);
    unscheduled.forEach((task, order) => newItem(data, { ...base, groupId: group.id, taskId: task.id, subtaskId: null, title: task.title, order, segments: [] }));
  }
  if (latest) planning.weekCount = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, weeksBetween(planning.startDate, mondayOf(latest)) + 1 + 2));
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

export function updateGroup(data: PlanningData, id: number, body: Record<string, unknown>, at: string): PlanningGroup {
  const group = findGroup(data, id);
  const next = { ...group };
  if (body.name !== undefined) next.name = text(body.name, 'name');
  if (body.collapsed !== undefined) next.collapsed = Boolean(body.collapsed);
  if (body.order !== undefined) next.order = int(body.order, 'order', 0, Number.MAX_SAFE_INTEGER);
  Object.assign(group, next);
  touch(findPlanning(data, group.planningId), at);
  return group;
}

export function deleteGroup(data: PlanningData, id: number, mode: unknown, at: string): void {
  if (!GROUP_DELETE_MODES.includes(mode as GroupDeleteMode)) bad(`mode must be one of: ${GROUP_DELETE_MODES.join(', ')}`);
  const group = findGroup(data, id);
  const members = data.planningItems.filter(i => i.groupId === id).sort((a, b) => a.order - b.order);
  if (mode === 'deleteItems') {
    data.planningItems = data.planningItems.filter(i => i.groupId !== id);
  } else {
    let order = nextOrder(data, group.planningId, null);
    members.forEach(item => { item.groupId = null; item.order = order++; });
  }
  data.planningGroups = data.planningGroups.filter(g => g.id !== id);
  touch(findPlanning(data, group.planningId), at);
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
    order: nextOrder(data, planning.id, groupId),
    segments: body.segments === undefined ? [] : segments(body.segments, defaultColor(planning)),
  });
  touch(planning, at);
  return item;
}

export function updateItem(data: PlanningData, id: number, body: Record<string, unknown>, at: string): PlanningItem {
  const item = findItem(data, id);
  const planning = findPlanning(data, item.planningId);
  const next = { ...item };
  if (body.taskId !== undefined || body.subtaskId !== undefined) {
    const linked = link(data, body.taskId !== undefined ? body.taskId : item.taskId, body.subtaskId !== undefined ? body.subtaskId : null);
    next.taskId = linked.taskId;
    next.subtaskId = linked.subtaskId;
    if (linked.title && body.title === undefined) next.title = linked.title;
  }
  if (body.title !== undefined) next.title = text(body.title, 'title');
  if (body.owner !== undefined) next.owner = optionalText(body.owner, 'owner');
  if (body.progress !== undefined) next.progress = int(body.progress, 'progress', 0, 100);
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
  data.planningItems = data.planningItems.filter(i => i.id !== id);
  touch(findPlanning(data, item.planningId), at);
}

// ── Segments (granular so concurrent drags on one item never overwrite each other) ──

export function addSegment(data: PlanningData, itemId: number, body: unknown, at: string): PlanningItem {
  const item = findItem(data, itemId);
  const planning = findPlanning(data, item.planningId);
  if (item.segments.length >= MAX_SEGMENTS) bad(`an item has at most ${MAX_SEGMENTS} segments`);
  const created = segment(body, defaultColor(planning));
  if (item.segments.some(s => s.id === created.id)) throw new PlanningError(409, 'segment id already exists');
  item.segments = [...item.segments, created];
  touch(planning, at);
  return item;
}

export function updateSegment(data: PlanningData, itemId: number, segmentId: string, body: unknown, at: string): PlanningItem {
  const item = findItem(data, itemId);
  const planning = findPlanning(data, item.planningId);
  const existing = item.segments.find(s => s.id === segmentId) ?? missing('Segment');
  const updated = segment(body, defaultColor(planning), existing);
  item.segments = item.segments.map(s => s.id === segmentId ? updated : s);
  touch(planning, at);
  return item;
}

export function deleteSegment(data: PlanningData, itemId: number, segmentId: string, at: string): PlanningItem {
  const item = findItem(data, itemId);
  if (!item.segments.some(s => s.id === segmentId)) missing('Segment');
  item.segments = item.segments.filter(s => s.id !== segmentId);
  touch(findPlanning(data, item.planningId), at);
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

/** Same rule as the client helper: done → 100, else % of done subtasks, else 0. */
export function taskProgress(task: Task): number {
  if (task.status === 'done') return 100;
  if (!task.subtasks?.length) return 0;
  return Math.round(100 * task.subtasks.filter(s => s.status === 'done').length / task.subtasks.length);
}
