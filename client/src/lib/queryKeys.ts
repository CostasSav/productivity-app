export const queryKeys = {
  // Sections
  sections: ['sections'] as const,
  section: (id: number) => ['sections', id] as const,

  // Tasks
  tasks: ['tasks'] as const,
  tasksBySection: (sectionId: number) => ['tasks', { sectionId }] as const,
  task: (id: number) => ['tasks', id] as const,

  // Notes
  notes: ['notes'] as const,
  notesBySection: (sectionId: number) => ['notes', { sectionId }] as const,
  note: (id: number) => ['notes', id] as const,

  // Pomodoro
  pomodoroSessions: ['pomodoroSessions'] as const,

  // Habits
  habits: ['habits'] as const,
  habitsArchived: ['habits', 'archived'] as const,
  habitLogs: (params?: { habitId?: number; from?: string; to?: string }) =>
    ['habitLogs', params ?? {}] as const,

  // Gratitude
  gratitude: ['gratitude'] as const,
  gratitudeToday: ['gratitude', 'today'] as const,
  gratitudeStats: ['gratitude', 'stats'] as const,
  gratitudeSettings: ['gratitudeSettings'] as const,

  // Grocery
  grocery: ['grocery'] as const,
  groceryStaples: ['groceryStaples'] as const,

  // Sleep
  sleep: ['sleep'] as const,
  sleepStats: ['sleep', 'stats'] as const,
  sleepByDate: (date: string) => ['sleep', date] as const,
  sleepSettings: ['sleepSettings'] as const,

  // Bibliotheca (Books)
  books: (params?: { status?: string; search?: string }) =>
    ['books', params ?? {}] as const,
  book: (id: number) => ['books', id] as const,
  bookStats: ['books', 'stats'] as const,
  bookNotes: (bookId: number) => ['bookNotes', bookId] as const,
  bookQuotes: (bookId: number) => ['bookQuotes', bookId] as const,
  bookQuoteRandom: ['bookQuotes', 'random'] as const,
  bookLearnings: (params?: { bookId?: number; search?: string }) =>
    ['bookLearnings', params ?? {}] as const,
  bibliothecaSettings: ['bibliothecaSettings'] as const,
};
