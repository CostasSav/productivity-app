import type { Task, Habit, HabitLog, RecurrenceType } from '../types';
import { buildWidgetSnapshot, widgetCalendarDate, habitLogCalendarDate } from '../widgets/snapshot';

export class CompletionError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export interface CompletionData { tasks: Task[]; habits: Habit[]; habitLogs: HabitLog[]; _taskSeq: number; _habitLogSeq: number }
export function calendarDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function logDay(value: unknown, zone: string): string | null {
  return habitLogCalendarDate(value, zone);
}
export function habitZone(): string {
  const zone = process.env.WIDGET_TIME_ZONE ?? 'Europe/Paris';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { throw new CompletionError(409, 'INVALID_TIME_ZONE'); }
  return zone;
}
export function updateTaskState(data: CompletionData, id: number, fields: Partial<Task>, nextDeadline: (d: string, r: RecurrenceType) => string) {
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx < 0) return undefined;
  const original = data.tasks[idx];
  if (data.tasks.filter(t => t.id === id).length !== 1) throw new CompletionError(409, 'AMBIGUOUS_TASK_ID');
  if (original.recurrenceIssued !== undefined && typeof original.recurrenceIssued !== 'boolean') throw new CompletionError(409, 'INVALID_RECURRENCE_STATE');
  if (fields.status !== undefined && !['todo', 'in_progress', 'done'].includes(original.status)) throw new CompletionError(409, 'INVALID_TASK_STATE');
  const updated = { ...original, ...fields, recurrenceIssued: original.recurrenceIssued };
  // Older completed occurrences are conservatively treated as already issued, even if a successor was deleted.
  if (original.status === 'done' && original.recurrenceIssued === undefined) updated.recurrenceIssued = true;
  let nextTask: Task | null = null;
  if (fields.status === 'done' && original.status !== 'done' && updated.recurrence && updated.deadline) {
    if (updated.recurrenceIssued === undefined) throw new CompletionError(409, 'AMBIGUOUS_RECURRENCE');
    if (typeof updated.recurrenceIssued !== 'boolean') throw new CompletionError(409, 'INVALID_RECURRENCE_STATE');
    if (!updated.recurrenceIssued) {
      if (!calendarDay(updated.deadline) || !['daily', 'weekly', 'monthly'].includes(updated.recurrence)) throw new CompletionError(409, 'INVALID_RECURRENCE');
      const deadline = nextDeadline(updated.deadline, updated.recurrence);
      if (!calendarDay(deadline)) throw new CompletionError(409, 'INVALID_RECURRENCE');
      const nextId = data.tasks.reduce((max, t) => Math.max(max, t.id), data._taskSeq) + 1;
      if (!Number.isSafeInteger(nextId)) throw new CompletionError(409, 'INVALID_SEQUENCE');
      nextTask = { ...updated, subtasks: structuredClone(updated.subtasks), id: nextId, status: 'todo', pinnedToday: false, pinnedAt: null,
        deadline, recurrenceIssued: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      updated.recurrenceIssued = true;
      data._taskSeq = nextId;
    }
  }
  if (fields.pinnedToday === true) updated.pinnedAt = new Date().toISOString();
  else if (fields.pinnedToday === false) updated.pinnedAt = null;
  if (fields.status === 'done') { updated.pinnedToday = false; updated.pinnedAt = null; }
  const changed = JSON.stringify(updated) !== JSON.stringify(original);
  if (changed) updated.updated_at = new Date(Math.max(Date.now(), (Date.parse(original.updated_at) || 0) + 1)).toISOString();
  data.tasks[idx] = updated;
  if (nextTask) data.tasks.push(nextTask);
  return { task: updated, nextTask, changed };
}

export function setHabitState(data: CompletionData, id: number, date: string, completed: boolean, zone: string, note: string | null = null, timestamp?: string) {
  if (!calendarDay(date)) throw new CompletionError(400, 'INVALID_DATE');
  const habit = data.habits.find(h => h.id === id);
  if (!habit || habit.archivedAt !== null) throw new CompletionError(404, 'HABIT_UNAVAILABLE');
  const logs = data.habitLogs.filter(l => l.habitId === id);
  const idCounts = new Map<number, number>();
  for (const log of data.habitLogs) idCounts.set(log.id, (idCounts.get(log.id) ?? 0) + 1);
  if (data.habits.filter(h => h.id === id).length !== 1 || logs.some(l => !logDay(l.completedAt, zone) || !Number.isSafeInteger(l.id) || l.id < 1 || idCounts.get(l.id) !== 1)) throw new CompletionError(409, 'AMBIGUOUS_HABIT_LOGS');
  const matching = logs.filter(l => logDay(l.completedAt, zone) === date);
  // Use the exact snapshot cohort, with this calendar day represented at local noon.
  const normalized = logs.map(l => ({ ...l, completedAt: logDay(l.completedAt, zone)! }));
  // UTC noon is not local noon in every supported zone; find an instant with the requested calendar label.
  let instant = new Date(date + 'T12:00:00Z');
  for (let i = 0; i < 48 && widgetCalendarDate(instant.toISOString(), zone) !== date; i++) instant = new Date(instant.getTime() + (widgetCalendarDate(instant.toISOString(), zone)! < date ? 1 : -1) * 3600000);
  if (widgetCalendarDate(instant.toISOString(), zone) !== date) throw new CompletionError(400, 'INVALID_DATE');
  const eligible = buildWidgetSnapshot({ tasks: [], habits: [habit], habitLogs: normalized }, zone, instant).habits.total === 1;
  if (!eligible) throw new CompletionError(409, 'HABIT_NOT_ELIGIBLE');
  if (completed && matching.length) {
    if (note !== null && !matching.some(l => l.note === note)) throw new CompletionError(409, 'EXISTING_LOG_METADATA');
    return { changed: false, log: matching.find(l => l.note === note) ?? matching[0] };
  }
  if (!completed) {
    if (matching.some(l => (l.note != null && l.note !== '') || Object.keys(l).some(k => !['id', 'habitId', 'completedAt', 'note'].includes(k)))) throw new CompletionError(409, 'ANNOTATED_LOG_CONFLICT');
    data.habitLogs = data.habitLogs.filter(l => !(l.habitId === id && logDay(l.completedAt, zone) === date));
    return { changed: matching.length > 0, log: null };
  }
  const nextId = data.habitLogs.reduce((max, l) => Math.max(max, l.id), data._habitLogSeq) + 1;
  if (!Number.isSafeInteger(nextId)) throw new CompletionError(409, 'INVALID_SEQUENCE');
  data._habitLogSeq = nextId;
  const entry = { id: nextId, habitId: id, completedAt: timestamp ?? instant.toISOString(), note };
  data.habitLogs.push(entry);
  return { changed: true, log: entry };
}
