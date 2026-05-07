import fs from 'fs';
import path from 'path';
import type { Task, Note, Section, SubTask, PomodoroSession, RecurrenceType } from '../types';

const DB_PATH = path.join(__dirname, '../../data/db.json');

interface DbData {
  sections: Section[];
  tasks: Task[];
  notes: Note[];
  pomodoroSessions: PomodoroSession[];
  _sectionSeq: number;
  _taskSeq: number;
  _noteSeq: number;
  _sessionSeq: number;
}

const EMPTY: DbData = { sections: [], tasks: [], notes: [], pomodoroSessions: [], _sectionSeq: 0, _taskSeq: 0, _noteSeq: 0, _sessionSeq: 0 };

function load(): DbData {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!raw.sections) raw.sections = [];
    if (raw._sectionSeq === undefined) raw._sectionSeq = 0;
    if (!raw.pomodoroSessions) raw.pomodoroSessions = [];
    if (raw._sessionSeq === undefined) raw._sessionSeq = 0;
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
};
