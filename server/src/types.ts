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
  updated_at?: string | null;  // ISO timestamp; enables conflict detection with external bridges
  source?: string | null;      // e.g. "vault:wiki/projects/<page>.md"; null = app-native
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

export type HabitFrequency = 'daily' | 'weekly' | 'weekly_count';

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  sectionId: number | null;
  color: string;
  icon: string;
  frequency: HabitFrequency;
  targetDays: number[]; // day-of-week numbers 0-6; used by 'weekly' mode
  targetCount: number | null; // used by 'weekly_count' mode
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

export interface GratitudeEntry {
  id: number;
  date: string;             // YYYY-MM-DD, one per day max
  items: string[];          // exactly 3 strings
  mood: number | null;      // 1-5, recorded after ritual
  completedAt: string;      // ISO timestamp
  durationSeconds: number;
  streak: number;           // consecutive-day streak, stored at save time
}

export interface GratitudeSettings {
  reminderEnabled: boolean;
  reminderTime: string;       // "HH:MM"
  onboardingComplete: boolean;
  totalEntries: number;
  longestStreak: number;
  currentStreak: number;
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

export const GROCERY_CATEGORIES = [
  'Produce', 'Meat & Fish', 'Dairy & Eggs', 'Bakery',
  'Frozen', 'Pantry', 'Drinks', 'Snacks',
  'Cleaning', 'Personal Care', 'Other',
] as const;

export type GroceryCategory = typeof GROCERY_CATEGORIES[number];

export interface GroceryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  checked: boolean;
  addedAt: string;
  note: string | null;
  order: number;
}

export interface GroceryStaple {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
}
