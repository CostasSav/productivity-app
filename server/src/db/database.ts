import fs from 'fs';
import path from 'path';
import type { Task, Note, Section, SubTask, PomodoroSession, RecurrenceType, Habit, HabitLog, GratitudeEntry, GratitudeSettings, GroceryItem, GroceryStaple, GroceryCategory } from '../types';
import { GROCERY_CATEGORIES } from '../types';

const DB_PATH = path.join(__dirname, '../../data/db.json');

interface DbData {
  sections: Section[];
  tasks: Task[];
  notes: Note[];
  pomodoroSessions: PomodoroSession[];
  habits: Habit[];
  habitLogs: HabitLog[];
  gratitudeEntries: GratitudeEntry[];
  gratitudeSettings: GratitudeSettings;
  groceryItems: GroceryItem[];
  groceryStaples: GroceryStaple[];
  _sectionSeq: number;
  _taskSeq: number;
  _noteSeq: number;
  _sessionSeq: number;
  _habitSeq: number;
  _habitLogSeq: number;
  _gratitudeSeq: number;
  _groceryItemSeq: number;
  _groceryStapleSeq: number;
}

const DEFAULT_GRATITUDE_SETTINGS: GratitudeSettings = {
  reminderEnabled: true,
  reminderTime: '21:00',
  onboardingComplete: false,
  totalEntries: 0,
  longestStreak: 0,
  currentStreak: 0,
};

const EMPTY: DbData = {
  sections: [], tasks: [], notes: [], pomodoroSessions: [], habits: [], habitLogs: [],
  gratitudeEntries: [], gratitudeSettings: { ...DEFAULT_GRATITUDE_SETTINGS },
  _sectionSeq: 0, _taskSeq: 0, _noteSeq: 0, _sessionSeq: 0, _habitSeq: 0, _habitLogSeq: 0,
  _gratitudeSeq: 0, _groceryItemSeq: 0, _groceryStapleSeq: 0,
  groceryItems: [], groceryStaples: [],
};

function load(): DbData {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!raw.sections) raw.sections = [];
    if (raw._sectionSeq === undefined) raw._sectionSeq = 0;
    if (!raw.pomodoroSessions) raw.pomodoroSessions = [];
    if (raw._sessionSeq === undefined) raw._sessionSeq = 0;
    if (!raw.habits) raw.habits = [];
    if (!raw.habitLogs) raw.habitLogs = [];
    if (raw._habitSeq === undefined) raw._habitSeq = 0;
    if (raw._habitLogSeq === undefined) raw._habitLogSeq = 0;
    // Backfill sections that predate source / updated_at
    if (Array.isArray(raw.sections)) {
      raw.sections.forEach((s: any) => { s.source ??= null; s.updated_at ??= null; });
    }
    // Backfill gratitude data
    if (!raw.gratitudeEntries) raw.gratitudeEntries = [];
    if (raw._gratitudeSeq === undefined) raw._gratitudeSeq = 0;
    if (!raw.gratitudeSettings) raw.gratitudeSettings = { ...DEFAULT_GRATITUDE_SETTINGS };
    // Backfill grocery data
    if (!raw.groceryItems) raw.groceryItems = [];
    if (!raw.groceryStaples) raw.groceryStaples = [];
    if (raw._groceryItemSeq === undefined) raw._groceryItemSeq = 0;
    if (raw._groceryStapleSeq === undefined) raw._groceryStapleSeq = 0;
    // Backfill order field within each category
    if (Array.isArray(raw.groceryItems)) {
      const catOrders: Record<string, number> = {};
      raw.groceryItems.forEach((item: any) => {
        if (item.order === undefined) {
          catOrders[item.category] = catOrders[item.category] ?? 0;
          item.order = catOrders[item.category]++;
        }
      });
    }
    // Migrate habits that predate the order field
    if (Array.isArray(raw.habits)) {
      raw.habits = (raw.habits as any[]).map((h: any, i: number) => ({
        targetCount: null,
        ...(h.order === undefined ? { ...h, order: i } : h),
      }));
    }
    // Migrate tasks that predate subtasks / pinnedToday / pinnedAt
    if (Array.isArray(raw.tasks)) {
      raw.tasks = (raw.tasks as any[]).map((t: any) => ({ subtasks: [], pinnedToday: false, pinnedAt: null, ...t }));
    }
    return raw;
  } catch {
    return { ...EMPTY };
  }
}

function save(data: DbData) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function now() {
  return new Date().toISOString();
}

export function nextDeadline(deadline: string, recurrence: RecurrenceType): string {
  const d = new Date(deadline + 'T12:00:00');
  if (recurrence === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === 'monthly') {
    const day = d.getDate();
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d.toISOString().split('T')[0];
}

/** Count consecutive days ending on `asOf` that have a gratitude entry. */
function calcStreak(entries: GratitudeEntry[], asOf: string): number {
  const dateSet = new Set(entries.map(e => e.date));
  let streak = 0;
  let cur = asOf;
  while (dateSet.has(cur)) {
    streak++;
    const d = new Date(cur + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    cur = d.toISOString().split('T')[0];
  }
  return streak;
}

function sortGroceryItems(a: GroceryItem, b: GroceryItem): number {
  const ai = GROCERY_CATEGORIES.indexOf(a.category as typeof GROCERY_CATEGORIES[number]);
  const bi = GROCERY_CATEGORIES.indexOf(b.category as typeof GROCERY_CATEGORIES[number]);
  if (ai !== bi) return ai - bi;
  return a.order - b.order;
}

function sortGrocery(a: { category: string; name: string }, b: { category: string; name: string }): number {
  if (a.category !== b.category) return a.category < b.category ? -1 : 1;
  return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
}

/** Write any in-memory migrations (backfills applied inside load()) back to disk. */
export function flushMigrations() {
  save(load());
}

export const db = {
  // ── Sections ────────────────────────────────────────
  getSections(): Section[] {
    return load().sections.sort((a, b) => a.created_at < b.created_at ? -1 : 1);
  },
  getSection(id: number): Section | undefined {
    return load().sections.find(s => s.id === id);
  },
  createSection(fields: Pick<Section, 'name' | 'color'>): Section {
    const data = load();
    data._sectionSeq += 1;
    const section: Section = { ...fields, id: data._sectionSeq, created_at: now() };
    data.sections.push(section);
    save(data);
    return section;
  },
  updateSection(id: number, fields: Partial<Pick<Section, 'name' | 'color'>>): Section | undefined {
    const data = load();
    const idx = data.sections.findIndex(s => s.id === id);
    if (idx === -1) return undefined;
    data.sections[idx] = { ...data.sections[idx], ...fields };
    save(data);
    return data.sections[idx];
  },
  deleteSection(id: number): boolean {
    const data = load();
    const before = data.sections.length;
    data.sections = data.sections.filter(s => s.id !== id);
    // Unlink tasks and notes from deleted section
    data.tasks = data.tasks.map(t => t.section_id === id ? { ...t, section_id: null } : t);
    data.notes = data.notes.map(n => n.section_id === id ? { ...n, section_id: null } : n);
    if (data.sections.length === before) return false;
    save(data);
    return true;
  },

  // ── Tasks ────────────────────────────────────────────
  getTasks(sectionId?: number | null): Task[] {
    const data = load();
    const tasks = sectionId != null
      ? data.tasks.filter(t => t.section_id === sectionId)
      : data.tasks;
    return [...tasks].sort((a, b) => {
      if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return b.created_at < a.created_at ? -1 : 1;
    });
  },
  getTask(id: number): Task | undefined {
    return load().tasks.find(t => t.id === id);
  },
  createTask(fields: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Task {
    const data = load();
    data._taskSeq += 1;
    const task: Task = { ...fields, id: data._taskSeq, created_at: now(), updated_at: now() };
    data.tasks.push(task);
    save(data);
    return task;
  },
  updateTask(id: number, fields: Partial<Omit<Task, 'id' | 'created_at'>>): { task: Task; nextTask: Task | null } | undefined {
    const data = load();
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    // Auto-manage pinnedAt when pinnedToday changes
    const derived: Partial<Task> = {};
    if (fields.pinnedToday === true) derived.pinnedAt = now();
    else if (fields.pinnedToday === false) derived.pinnedAt = null;
    // Auto-unpin when marked done
    if (fields.status === 'done') { derived.pinnedToday = false; derived.pinnedAt = null; }
    data.tasks[idx] = { ...data.tasks[idx], ...fields, ...derived, updated_at: now() };
    const updated = data.tasks[idx];
    let nextTask: Task | null = null;
    if (fields.status === 'done' && updated.recurrence && updated.deadline) {
      data._taskSeq += 1;
      nextTask = {
        ...updated,
        id: data._taskSeq,
        status: 'todo',
        pinnedToday: false,
        pinnedAt: null,
        deadline: nextDeadline(updated.deadline, updated.recurrence),
        created_at: now(),
        updated_at: now(),
      };
      data.tasks.push(nextTask);
    }
    save(data);
    return { task: updated, nextTask };
  },
  unpinStaleTasks(): void {
    const data = load();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let changed = false;
    data.tasks = data.tasks.map(t => {
      if (t.pinnedToday && t.pinnedAt && t.pinnedAt < cutoff) {
        changed = true;
        return { ...t, pinnedToday: false, pinnedAt: null, updated_at: now() };
      }
      return t;
    });
    if (changed) save(data);
  },
  deleteTask(id: number): boolean {
    const data = load();
    const before = data.tasks.length;
    data.tasks = data.tasks.filter(t => t.id !== id);
    if (data.tasks.length === before) return false;
    save(data);
    return true;
  },

  // ── Subtasks ─────────────────────────────────────────
  addSubtask(taskId: number, title: string): Task | undefined {
    const data = load();
    const idx = data.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return undefined;
    const subs = data.tasks[idx].subtasks;
    const nextId = subs.length > 0 ? Math.max(...subs.map((s: SubTask) => s.id)) + 1 : 1;
    subs.push({ id: nextId, title, status: 'todo' });
    data.tasks[idx].updated_at = now();
    save(data);
    return data.tasks[idx];
  },
  updateSubtask(taskId: number, subId: number, fields: Partial<Pick<SubTask, 'title' | 'status'>>): Task | undefined {
    const data = load();
    const idx = data.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return undefined;
    const subIdx = data.tasks[idx].subtasks.findIndex((s: SubTask) => s.id === subId);
    if (subIdx === -1) return undefined;
    data.tasks[idx].subtasks[subIdx] = { ...data.tasks[idx].subtasks[subIdx], ...fields };
    data.tasks[idx].updated_at = now();
    save(data);
    return data.tasks[idx];
  },
  deleteSubtask(taskId: number, subId: number): Task | undefined {
    const data = load();
    const idx = data.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return undefined;
    data.tasks[idx].subtasks = data.tasks[idx].subtasks.filter((s: SubTask) => s.id !== subId);
    data.tasks[idx].updated_at = now();
    save(data);
    return data.tasks[idx];
  },

  // ── Notes ────────────────────────────────────────────
  getNotes(sectionId?: number | null): Omit<Note, 'content'>[] {
    const data = load();
    const notes = sectionId != null
      ? data.notes.filter(n => n.section_id === sectionId)
      : data.notes;
    return notes
      .map(({ content: _c, ...rest }) => rest)
      .sort((a, b) => (b.created_at < a.created_at ? -1 : 1));
  },
  getNote(id: number): Note | undefined {
    return load().notes.find(n => n.id === id);
  },
  createNote(fields: Partial<Pick<Note, 'title' | 'content' | 'section_id'>>): Note {
    const data = load();
    data._noteSeq += 1;
    const note: Note = {
      id: data._noteSeq,
      title: fields.title ?? 'Untitled Note',
      content: fields.content ?? '',
      summary: null,
      section_id: fields.section_id ?? null,
      created_at: now(),
      updated_at: now(),
    };
    data.notes.push(note);
    save(data);
    return note;
  },
  updateNote(id: number, fields: Partial<Pick<Note, 'title' | 'content' | 'summary' | 'section_id'>>): Note | undefined {
    const data = load();
    const idx = data.notes.findIndex(n => n.id === id);
    if (idx === -1) return undefined;
    const existing = data.notes[idx];
    const contentChanged = fields.content !== undefined && fields.content !== existing.content;
    data.notes[idx] = {
      ...existing,
      ...fields,
      summary: contentChanged ? null : (fields.summary !== undefined ? fields.summary : existing.summary),
      updated_at: now(),
    };
    save(data);
    return data.notes[idx];
  },
  deleteNote(id: number): boolean {
    const data = load();
    const before = data.notes.length;
    data.notes = data.notes.filter(n => n.id !== id);
    data.tasks = data.tasks.map(t => t.note_id === id ? { ...t, note_id: null } : t);
    if (data.notes.length === before) return false;
    save(data);
    return true;
  },
  getNoteTitles(): string[] {
    return load().notes.map(n => n.title);
  },

  // ── Pomodoro sessions ─────────────────────────────────
  getPomodoroSessions(): PomodoroSession[] {
    const data = load();
    return [...data.pomodoroSessions].sort((a, b) =>
      a.completedAt < b.completedAt ? 1 : -1
    );
  },
  createPomodoroSession(fields: Omit<PomodoroSession, 'id'>): PomodoroSession {
    const data = load();
    data._sessionSeq += 1;
    const session: PomodoroSession = { ...fields, id: data._sessionSeq };
    data.pomodoroSessions.push(session);
    save(data);
    return session;
  },

  // ── Habits ───────────────────────────────────────────
  getHabits(): Habit[] {
    return load().habits
      .filter(h => h.archivedAt === null)
      .sort((a, b) => a.order - b.order);
  },
  getArchivedHabits(): Habit[] {
    return load().habits
      .filter(h => h.archivedAt !== null)
      .sort((a, b) => (a.archivedAt! > b.archivedAt! ? -1 : 1));
  },
  getHabit(id: number): Habit | undefined {
    return load().habits.find(h => h.id === id);
  },
  createHabit(fields: Omit<Habit, 'id' | 'createdAt' | 'archivedAt' | 'order'>): Habit {
    const data = load();
    data._habitSeq += 1;
    const maxOrder = data.habits.reduce((m, h) => Math.max(m, h.order ?? 0), -1);
    const habit: Habit = { ...fields, id: data._habitSeq, order: maxOrder + 1, createdAt: now(), archivedAt: null };
    data.habits.push(habit);
    save(data);
    return habit;
  },
  updateHabit(id: number, fields: Partial<Omit<Habit, 'id' | 'createdAt'>>): Habit | undefined {
    const data = load();
    const idx = data.habits.findIndex(h => h.id === id);
    if (idx === -1) return undefined;
    data.habits[idx] = { ...data.habits[idx], ...fields };
    save(data);
    return data.habits[idx];
  },
  reorderHabits(ids: number[]): void {
    const data = load();
    ids.forEach((id, idx) => {
      const habit = data.habits.find(h => h.id === id);
      if (habit) habit.order = idx;
    });
    save(data);
  },

  // ── Habit logs ───────────────────────────────────────
  getHabitLogs(filters?: { habitId?: number; from?: string; to?: string }): HabitLog[] {
    let logs = load().habitLogs;
    if (filters?.habitId != null) logs = logs.filter(l => l.habitId === filters.habitId);
    if (filters?.from) logs = logs.filter(l => l.completedAt >= filters.from!);
    if (filters?.to) logs = logs.filter(l => l.completedAt <= filters.to!);
    return [...logs].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  },
  createHabitLog(fields: Omit<HabitLog, 'id'>): HabitLog {
    const data = load();
    data._habitLogSeq += 1;
    const log: HabitLog = { ...fields, id: data._habitLogSeq };
    data.habitLogs.push(log);
    save(data);
    return log;
  },
  deleteHabitLog(id: number): boolean {
    const data = load();
    const before = data.habitLogs.length;
    data.habitLogs = data.habitLogs.filter(l => l.id !== id);
    if (data.habitLogs.length === before) return false;
    save(data);
    return true;
  },

  // ── Gratitude entries ─────────────────────────────────
  getGratitudeEntries(): GratitudeEntry[] {
    return [...load().gratitudeEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  getTodayGratitudeEntry(today: string): GratitudeEntry | null {
    return load().gratitudeEntries.find(e => e.date === today) ?? null;
  },

  /** Create or update today's entry, then recalculate streaks in settings. */
  saveGratitudeEntry(fields: {
    date: string;
    items: string[];
    mood: number | null;
    completedAt: string;
    durationSeconds: number;
  }): GratitudeEntry {
    const data = load();
    const existing = data.gratitudeEntries.findIndex(e => e.date === fields.date);
    const streak = calcStreak(
      // Include today's date in the set before counting
      existing === -1
        ? [...data.gratitudeEntries, { date: fields.date } as GratitudeEntry]
        : data.gratitudeEntries,
      fields.date,
    );

    let entry: GratitudeEntry;
    if (existing !== -1) {
      data.gratitudeEntries[existing] = { ...data.gratitudeEntries[existing], ...fields, streak };
      entry = data.gratitudeEntries[existing];
    } else {
      data._gratitudeSeq += 1;
      entry = { ...fields, id: data._gratitudeSeq, streak };
      data.gratitudeEntries.push(entry);
      data.gratitudeSettings.totalEntries += 1;
    }

    data.gratitudeSettings.currentStreak = streak;
    if (streak > data.gratitudeSettings.longestStreak) {
      data.gratitudeSettings.longestStreak = streak;
    }

    save(data);
    return entry;
  },

  // ── Gratitude settings ────────────────────────────────
  getGratitudeSettings(): GratitudeSettings {
    return load().gratitudeSettings;
  },

  updateGratitudeSettings(fields: Partial<Pick<GratitudeSettings, 'reminderEnabled' | 'reminderTime' | 'onboardingComplete' | 'currentStreak'>>): GratitudeSettings {
    const data = load();
    data.gratitudeSettings = { ...data.gratitudeSettings, ...fields };
    save(data);
    return data.gratitudeSettings;
  },

  // ── Grocery items ─────────────────────────────────────
  getGroceryItems(): GroceryItem[] {
    return [...load().groceryItems].sort(sortGroceryItems);
  },

  addGroceryItem(fields: { name: string; quantity: number; unit: string; category: GroceryCategory; note?: string | null }): GroceryItem {
    const data = load();
    data._groceryItemSeq += 1;
    const catItems = data.groceryItems.filter(i => i.category === fields.category);
    const maxOrder = catItems.reduce((max, i) => Math.max(max, i.order), -1);
    const item: GroceryItem = {
      id: data._groceryItemSeq,
      name: fields.name,
      quantity: fields.quantity,
      unit: fields.unit,
      category: fields.category,
      checked: false,
      addedAt: now(),
      note: fields.note ?? null,
      order: maxOrder + 1,
    };
    data.groceryItems.push(item);
    save(data);
    return item;
  },

  updateGroceryItem(id: number, fields: Partial<Pick<GroceryItem, 'name' | 'quantity' | 'unit' | 'checked' | 'note' | 'category'>>): GroceryItem | undefined {
    const data = load();
    const idx = data.groceryItems.findIndex(i => i.id === id);
    if (idx === -1) return undefined;
    data.groceryItems[idx] = { ...data.groceryItems[idx], ...fields };
    save(data);
    return data.groceryItems[idx];
  },

  deleteGroceryItem(id: number): boolean {
    const data = load();
    const before = data.groceryItems.length;
    data.groceryItems = data.groceryItems.filter(i => i.id !== id);
    if (data.groceryItems.length === before) return false;
    save(data);
    return true;
  },

  deleteCheckedGroceryItems(): number {
    const data = load();
    const before = data.groceryItems.length;
    data.groceryItems = data.groceryItems.filter(i => !i.checked);
    const removed = before - data.groceryItems.length;
    if (removed > 0) save(data);
    return removed;
  },

  clearGroceryList(): number {
    const data = load();
    const count = data.groceryItems.length;
    data.groceryItems = [];
    data._groceryItemSeq = 0;
    if (count > 0) save(data);
    return count;
  },

  // ── Grocery staples ───────────────────────────────────
  getGroceryStaples(): GroceryStaple[] {
    return [...load().groceryStaples].sort(sortGrocery);
  },

  addGroceryStaple(fields: { name: string; quantity: number; unit: string; category: GroceryCategory }): GroceryStaple {
    const data = load();
    data._groceryStapleSeq += 1;
    const staple: GroceryStaple = { id: data._groceryStapleSeq, ...fields };
    data.groceryStaples.push(staple);
    save(data);
    return staple;
  },

  updateGroceryStaple(id: number, fields: Partial<Pick<GroceryStaple, 'name' | 'quantity' | 'unit' | 'category'>>): GroceryStaple | undefined {
    const data = load();
    const idx = data.groceryStaples.findIndex(s => s.id === id);
    if (idx === -1) return undefined;
    data.groceryStaples[idx] = { ...data.groceryStaples[idx], ...fields };
    save(data);
    return data.groceryStaples[idx];
  },

  deleteGroceryStaple(id: number): boolean {
    const data = load();
    const before = data.groceryStaples.length;
    data.groceryStaples = data.groceryStaples.filter(s => s.id !== id);
    if (data.groceryStaples.length === before) return false;
    save(data);
    return true;
  },

  addStaplesToList(): { added: number; skipped: number } {
    const data = load();
    const existingNames = new Set(data.groceryItems.map(i => i.name.toLowerCase()));
    let added = 0;
    let skipped = 0;
    for (const staple of data.groceryStaples) {
      if (existingNames.has(staple.name.toLowerCase())) {
        skipped++;
        continue;
      }
      data._groceryItemSeq += 1;
      const catItems = data.groceryItems.filter(i => i.category === staple.category);
      const maxOrder = catItems.reduce((max, i) => Math.max(max, i.order), -1);
      data.groceryItems.push({
        id: data._groceryItemSeq,
        name: staple.name,
        quantity: staple.quantity,
        unit: staple.unit,
        category: staple.category,
        checked: false,
        addedAt: now(),
        note: null,
        order: maxOrder + 1,
      });
      existingNames.add(staple.name.toLowerCase());
      added++;
    }
    if (added > 0) save(data);
    return { added, skipped };
  },

  reorderGroceryItems(ids: number[]): void {
    const data = load();
    ids.forEach((id, index) => {
      const item = data.groceryItems.find(i => i.id === id);
      if (item) item.order = index;
    });
    save(data);
  },
};
