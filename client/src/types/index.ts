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
  color: string;
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

export interface Note {
  id: number;
  title: string;
  content: string;
  summary: string | null;
  section_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface NoteListItem {
  id: number;
  title: string;
  summary: string | null;
  section_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedTask {
  title: string;
  priority: Priority;
  deadline: string | null;
  subtasks: string[];
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

export interface PomodoroSession {
  id: number;
  taskId: number | null;
  taskTitle: string;
  startedAt: string;
  completedAt: string;
  type: 'work' | 'break';
}
