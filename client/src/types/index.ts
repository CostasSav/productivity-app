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
  updated_at?: string | null;
  source?: string | null;
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

export type HabitFrequency = 'daily' | 'weekly' | 'weekly_count';

export interface Habit {
  id: number;
  name: string;
  description: string | null;
  sectionId: number | null;
  color: string;
  icon: string;
  frequency: HabitFrequency;
  targetDays: number[]; // used by 'weekly' mode
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
  date: string;
  items: string[];
  mood: number | null;
  completedAt: string;
  durationSeconds: number;
  streak: number;
}

export interface GratitudeSettings {
  reminderEnabled: boolean;
  reminderTime: string;
  onboardingComplete: boolean;
  totalEntries: number;
  longestStreak: number;
  currentStreak: number;
}

export interface SleepEntry {
  id: number;
  date: string;
  bedtime: string;
  wakeTime: string;
  durationMinutes: number;
  quality: number;
  energy: number;
  note: string | null;
  createdAt: string;
}

export interface SleepSettings {
  sleepTarget: number;
  weekStartsOn: 0 | 1;
  aiInsightLastGenerated: string | null;
  aiInsightText: string | null;
}

export interface SleepStats {
  averageDuration7d: number | null;
  averageDuration30d: number | null;
  averageQuality7d: number | null;
  currentSleepDebt: number;
  consistencyScore: number;
  weekdayAvgDuration: number | null;
  weekendAvgDuration: number | null;
  longestStreak: number;
  currentStreak: number;
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

export interface PomodoroSession {
  id: number;
  taskId: number | null;
  taskTitle: string;
  startedAt: string;
  completedAt: string;
  type: 'work' | 'break';
}

// ── Bibliotheca ───────────────────────────────────────────────────────────────

export type BookStatus = 'reading' | 'finished' | 'want-to-read' | 'dnf';

export interface Book {
  id: number;
  title: string;
  author: string;
  coverUrl: string | null;
  openLibraryKey: string | null;
  totalPages: number | null;
  currentPage: number;
  status: BookStatus;
  rating: number | null;
  genre: string | null;
  tags: string[];
  synopsis: string | null;
  dnfReason: string | null;
  recommendedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  wantToReadOrder: number;
  createdAt: string;
}

export interface BookWithCounts extends Book {
  notesCount: number;
  quotesCount: number;
  learningsCount: number;
}

export interface BookNote {
  id: number;
  bookId: number;
  content: string;
  pageNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookQuote {
  id: number;
  bookId: number;
  text: string;
  pageNumber: number | null;
  createdAt: string;
}

export interface BookQuoteWithBook extends BookQuote {
  bookTitle: string;
  bookAuthor: string;
}

export interface BookLearning {
  id: number;
  bookId: number;
  term: string;
  definition: string;
  pageNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BibliothecaSettings {
  yearlyGoal: number;
  currentYear: number;
}

export interface BookStats {
  totalFinished: number;
  finishedThisYear: number;
  yearlyGoal: number;
  averageRating: number | null;
  totalPages: number;
  byGenre: { genre: string; count: number }[];
  byYear: { year: number; count: number }[];
  totalQuotes: number;
  totalLearnings: number;
  currentlyReading: Book[];
}

export interface OpenLibraryResult {
  title: string;
  author: string;
  coverUrl: string | null;
  openLibraryKey: string | null;
  totalPages: number | null;
}
