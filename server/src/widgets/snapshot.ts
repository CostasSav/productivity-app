import type { Task, Habit, HabitLog, TaskStatus, Priority, HabitFrequency } from '../types';

export interface WidgetData { tasks: Task[]; habits: Habit[]; habitLogs: HabitLog[] }
export interface TaskItem { id: number; title: string; status: TaskStatus; priority: Priority; deadline: string }
export interface HabitItem {
  id: number; name: string; icon: string; color: string; frequency: HabitFrequency;
  completedToday: boolean; weekly: { completed: number; target: number; remaining: number } | null;
}
export interface Cohort<T> { total: number; completed: number; remaining: number; progress: number | null; truncated: boolean; items: T[] }
export interface WidgetSnapshot {
  schemaVersion: 1; date: string; timeZone: string; generatedAt: string;
  tasks: Cohort<TaskItem> & { scope: 'due-today' }; habits: Cohort<HabitItem>;
}
export const ITEM_LIMIT = 10;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const validId = (id: number) => Number.isSafeInteger(id) && id > 0;
const calendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function formatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
}
function dateInZone(date: Date, format: Intl.DateTimeFormat): string {
  const parts = format.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
// Date-only values are calendar dates. Timestamps must carry an explicit offset.
function normalizeDate(value: unknown, format: Intl.DateTimeFormat): string | null {
  if (typeof value !== 'string') return null;
  if (calendarDate(value)) return value;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !calendarDate(value.slice(0, 10))) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? dateInZone(new Date(milliseconds), format) : null;
}
function cohort<T>(items: T[], completed: number): Cohort<T> {
  return { total: items.length, completed, remaining: items.length - completed,
    progress: items.length ? Math.round(completed / items.length * 10000) / 10000 : null,
    truncated: items.length > ITEM_LIMIT, items: items.slice(0, ITEM_LIMIT) };
}

export function buildWidgetSnapshot(data: WidgetData, timeZone: string, now = new Date()): WidgetSnapshot {
  const format = formatter(timeZone);
  const today = dateInZone(now, format);
  // UTC arithmetic is on calendar labels only, never local-time instants (DST safe).
  const calendar = new Date(today + 'T00:00:00Z');
  const dow = calendar.getUTCDay();
  calendar.setUTCDate(calendar.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  const monday = calendar.toISOString().slice(0, 10);
  const taskItems: TaskItem[] = data.tasks.filter(t => validId(t.id) &&
    ['todo', 'in_progress', 'done'].includes(t.status) && ['low', 'medium', 'high'].includes(t.priority) &&
    normalizeDate(t.deadline, format) === today).map(t => ({ id: t.id, title: text(t.title, 160),
      status: t.status, priority: t.priority, deadline: today }));
  taskItems.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || a.id - b.id);
  const dates = new Map<number, Set<string>>();
  for (const log of data.habitLogs) {
    const date = normalizeDate(log.completedAt, format);
    if (!date || date < monday || date > today) continue;
    if (!dates.has(log.habitId)) dates.set(log.habitId, new Set());
    dates.get(log.habitId)!.add(date);
  }
  const habitItems: HabitItem[] = [];
  for (const h of [...data.habits].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id)) {
    if (!validId(h.id) || h.archivedAt !== null) continue;
    const logged = dates.get(h.id) ?? new Set<string>();
    const completedToday = logged.has(today);
    let weekly: HabitItem['weekly'] = null;
    if (h.frequency === 'weekly') {
      if (!Array.isArray(h.targetDays) || !h.targetDays.length || h.targetDays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || !h.targetDays.includes(dow)) continue;
      const target = new Set(h.targetDays).size;
      const completed = [...logged].filter(date => h.targetDays.includes(new Date(date + 'T00:00:00Z').getUTCDay())).length;
      weekly = { completed, target, remaining: Math.max(0, target - completed) };
    } else if (h.frequency === 'weekly_count') {
      const target = h.targetCount ?? 1; // matches existing frontend default
      if (!Number.isInteger(target) || target < 1 || target > 7) continue;
      const beforeToday = logged.size - Number(completedToday);
      if (beforeToday >= target) continue;
      weekly = { completed: logged.size, target, remaining: Math.max(0, target - logged.size) };
    } else if (h.frequency !== 'daily') continue;
    habitItems.push({ id: h.id, name: text(h.name, 160), icon: text(h.icon, 32), color: text(h.color, 32),
      frequency: h.frequency, completedToday, weekly });
  }
  habitItems.sort((a, b) => Number(a.completedToday) - Number(b.completedToday));
  return { schemaVersion: 1, date: today, timeZone, generatedAt: now.toISOString(),
    tasks: { scope: 'due-today', ...cohort(taskItems, taskItems.filter(t => t.status === 'done').length) },
    habits: cohort(habitItems, habitItems.filter(h => h.completedToday).length) };
}
