import type { Task, Note, NoteListItem, ExtractedTask, SummaryResult, Section, PomodoroSession, Habit, HabitLog, GratitudeEntry, GratitudeSettings, GroceryItem, GroceryStaple, SleepEntry, SleepSettings, SleepStats, Book, BookWithCounts, BookNote, BookQuote, BookQuoteWithBook, BookLearning, BibliothecaSettings, BookStats, OpenLibraryResult, BookStatus } from '../types';

interface GratitudeStats { currentStreak: number; totalEntries: number; longestStreak: number; completedDates: string[]; }
interface GratitudeSettingsUpdate { reminderEnabled: boolean; reminderTime: string; onboardingComplete: boolean; resetStreak: boolean; }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  sections: {
    list: () => request<Section[]>('/api/sections'),
    create: (data: Pick<Section, 'name' | 'color'>) => request<Section>('/api/sections', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Pick<Section, 'name' | 'color'>>) => request<Section>(`/api/sections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/sections/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: (sectionId?: number) => request<Task[]>(`/api/tasks${sectionId != null ? `?section_id=${sectionId}` : ''}`),
    create: (data: Partial<Task>) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Task>) => request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
    addSubtask: (taskId: number, title: string) =>
      request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
    updateSubtask: (taskId: number, subId: number, data: { title?: string; status?: string }) =>
      request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${taskId}/subtasks/${subId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteSubtask: (taskId: number, subId: number) =>
      request<{ task: Task; nextTask: Task | null }>(`/api/tasks/${taskId}/subtasks/${subId}`, { method: 'DELETE' }),
  },
  notes: {
    list: (sectionId?: number) => request<NoteListItem[]>(`/api/notes${sectionId != null ? `?section_id=${sectionId}` : ''}`),
    get: (id: number) => request<Note>(`/api/notes/${id}`),
    create: (data: Partial<Note>) => request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Note>) => request<Note>(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),
  },
  pomodoroSessions: {
    list: () => request<PomodoroSession[]>('/api/pomodoro-sessions'),
    create: (data: Omit<PomodoroSession, 'id'>) =>
      request<PomodoroSession>('/api/pomodoro-sessions', { method: 'POST', body: JSON.stringify(data) }),
  },
  habits: {
    list: () => request<Habit[]>('/api/habits'),
    listArchived: () => request<Habit[]>('/api/habits?archived=true'),
    create: (data: Omit<Habit, 'id' | 'createdAt' | 'archivedAt' | 'order'>) =>
      request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Habit, 'id' | 'createdAt'>>) =>
      request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: number) => request<Habit>(`/api/habits/${id}`, { method: 'DELETE' }),
    reorder: (ids: number[]) => request<void>('/api/habits/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    listLogs: (params?: { habitId?: number; from?: string; to?: string }) => {
      const q = new URLSearchParams();
      if (params?.habitId != null) q.set('habitId', String(params.habitId));
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      const qs = q.toString();
      return request<HabitLog[]>(`/api/habit-logs${qs ? `?${qs}` : ''}`);
    },
    createLog: (data: { habitId: number; completedAt?: string; note?: string }) =>
      request<HabitLog>('/api/habit-logs', { method: 'POST', body: JSON.stringify(data) }),
    deleteLog: (id: number) => request<void>(`/api/habit-logs/${id}`, { method: 'DELETE' }),
  },
  gratitude: {
    list: () => request<GratitudeEntry[]>('/api/gratitude'),
    today: () => request<GratitudeEntry | null>('/api/gratitude/today'),
    stats: () => request<GratitudeStats>('/api/gratitude/stats'),
    save: (data: { items: string[]; mood: number | null; durationSeconds: number; completedAt?: string }) =>
      request<GratitudeEntry>('/api/gratitude', { method: 'POST', body: JSON.stringify(data) }),
  },
  gratitudeSettings: {
    get: () => request<GratitudeSettings>('/api/gratitude-settings'),
    update: (data: Partial<GratitudeSettingsUpdate>) =>
      request<GratitudeSettings>('/api/gratitude-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },
  grocery: {
    list: () => request<GroceryItem[]>('/api/grocery'),
    add: (data: { name: string; quantity?: number; unit?: string; category?: string; note?: string }) =>
      request<GroceryItem>('/api/grocery', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; quantity?: number; unit?: string; checked?: boolean; note?: string | null; category?: string }) =>
      request<GroceryItem>(`/api/grocery/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    reorder: (ids: number[]) => request<void>('/api/grocery/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    delete: (id: number) => request<void>(`/api/grocery/${id}`, { method: 'DELETE' }),
    deleteChecked: () => request<{ removed: number }>('/api/grocery/checked', { method: 'DELETE' }),
    clearAll: () => request<{ removed: number }>('/api/grocery/all', { method: 'DELETE', body: JSON.stringify({ confirm: true }) }),
  },
  groceryStaples: {
    list: () => request<GroceryStaple[]>('/api/grocery/staples'),
    add: (data: { name: string; quantity?: number; unit?: string; category?: string }) =>
      request<GroceryStaple>('/api/grocery/staples', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; quantity?: number; unit?: string; category?: string }) =>
      request<GroceryStaple>(`/api/grocery/staples/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/grocery/staples/${id}`, { method: 'DELETE' }),
    addToList: () => request<{ added: number; skipped: number }>('/api/grocery/staples/add-to-list', { method: 'POST' }),
  },
  sleep: {
    list: () => request<SleepEntry[]>('/api/sleep'),
    stats: () => request<SleepStats>('/api/sleep/stats'),
    getByDate: (date: string) => request<SleepEntry | null>(`/api/sleep/${date}`),
    save: (data: { date: string; bedtime: string; wakeTime: string; quality: number; energy: number; note?: string | null }) =>
      request<SleepEntry>('/api/sleep', { method: 'POST', body: JSON.stringify(data) }),
    delete: (date: string) => request<void>(`/api/sleep/${date}`, { method: 'DELETE' }),
    generateInsight: () => request<{ text: string; generatedAt: string }>('/api/sleep/insight', { method: 'POST' }),
  },
  sleepSettings: {
    get: () => request<SleepSettings>('/api/sleep-settings'),
    update: (data: Partial<SleepSettings>) =>
      request<SleepSettings>('/api/sleep-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },
  ai: {
    summarize: (noteId: number) => request<SummaryResult>('/api/ai/summarize', { method: 'POST', body: JSON.stringify({ noteId }) }),
    extractTasks: (noteId: number) => request<{ tasks: ExtractedTask[] }>('/api/ai/extract-tasks', { method: 'POST', body: JSON.stringify({ noteId }) }),
    confirmTasks: (noteId: number, tasks: ExtractedTask[]) => request<{ inserted: number }>('/api/ai/confirm-tasks', { method: 'POST', body: JSON.stringify({ noteId, tasks }) }),
    explainTerm: (term: string) => request<{ explanation: string }>('/api/ai/explain-term', { method: 'POST', body: JSON.stringify({ term }) }),
    quizInsight: (data: { score: number; total: number; missedTerms: Array<{ term: string; definition: string }> }) =>
      request<{ insight: string }>('/api/ai/quiz-insight', { method: 'POST', body: JSON.stringify(data) }),
  },
  books: {
    list: (params?: { status?: BookStatus; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<BookWithCounts[]>(`/api/books${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => request<BookWithCounts>(`/api/books/${id}`),
    stats: () => request<BookStats>('/api/books/stats'),
    searchOpenLibrary: (query: string) => request<OpenLibraryResult[]>('/api/books/search-open-library', { method: 'POST', body: JSON.stringify({ query }) }),
    create: (data: Omit<Book, 'id' | 'createdAt' | 'wantToReadOrder'>) =>
      request<Book>('/api/books', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<Book, 'id' | 'createdAt'>>) =>
      request<Book>(`/api/books/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/books/${id}`, { method: 'DELETE' }),
  },
  bookNotes: {
    list: (bookId: number) => request<BookNote[]>(`/api/book-notes?bookId=${bookId}`),
    create: (data: { bookId: number; content: string; pageNumber?: number | null }) =>
      request<BookNote>('/api/book-notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { content?: string; pageNumber?: number | null }) =>
      request<BookNote>(`/api/book-notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/book-notes/${id}`, { method: 'DELETE' }),
  },
  bookQuotes: {
    list: (bookId: number) => request<BookQuote[]>(`/api/book-quotes?bookId=${bookId}`),
    random: () => request<BookQuoteWithBook | null>('/api/book-quotes/random'),
    create: (data: { bookId: number; text: string; pageNumber?: number | null }) =>
      request<BookQuote>('/api/book-quotes', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/book-quotes/${id}`, { method: 'DELETE' }),
  },
  bookLearnings: {
    list: (params?: { bookId?: number; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.bookId != null) q.set('bookId', String(params.bookId));
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<BookLearning[]>(`/api/book-learnings${qs ? `?${qs}` : ''}`);
    },
    create: (data: { bookId: number; term: string; definition: string; pageNumber?: number | null }) =>
      request<BookLearning>('/api/book-learnings', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { term?: string; definition?: string; pageNumber?: number | null }) =>
      request<BookLearning>(`/api/book-learnings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/api/book-learnings/${id}`, { method: 'DELETE' }),
  },
  bibliothecaSettings: {
    get: () => request<BibliothecaSettings>('/api/bibliotheca-settings'),
    update: (data: Partial<BibliothecaSettings>) =>
      request<BibliothecaSettings>('/api/bibliotheca-settings', { method: 'PATCH', body: JSON.stringify(data) }),
  },
};
