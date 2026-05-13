export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface SubTask {
  id: number;
  title: string;
  status: 'todo' | 'done';
}

export interface Section {
  id: number;
  name: string;
  color: string; // hex color, e.g. '#6366f1'
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  deadline: string | null;
  note_id: number | null;
  section_id: number | null;
  recurrence: RecurrenceType | null;
  recurrence_day: number | null;
  recurrence_time: string | null;
  subtasks: SubTask[];
  pinnedToday: boolean;
  pinnedAt: string | null;
  created_at: string;
  updated_at: string;
}

export interface PomodoroSession {
  id: number;
  taskId: number | null;
  taskTitle: string;
  startedAt: string;  // ISO timestamp
  completedAt: string; // ISO timestamp
  type: 'work' | 'break';
}

export type HabitFrequency = 'daily' | 'weekly';

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  sectionId: number | null;
  color: string;
  icon: string;
  frequency: HabitFrequency;
  targetDays: number[]; // day-of-week numbers 0-6; empty for daily
  order: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface HabitLog {
  id: number;
  habitId: number;
  completedAt: string;
  note: string | null;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  summary: string | null;
  section_id: number | null;
  created_at: string;
  updated_at: string;
}
