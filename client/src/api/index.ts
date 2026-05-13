import type { Task, Note, NoteListItem, ExtractedTask, SummaryResult, Section, PomodoroSession, Habit, HabitLog } from '../types';

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
  ai: {
    summarize: (noteId: number) => request<SummaryResult>('/api/ai/summarize', { method: 'POST', body: JSON.stringify({ noteId }) }),
    extractTasks: (noteId: number) => request<{ tasks: ExtractedTask[] }>('/api/ai/extract-tasks', { method: 'POST', body: JSON.stringify({ noteId }) }),
    confirmTasks: (noteId: number, tasks: ExtractedTask[]) => request<{ inserted: number }>('/api/ai/confirm-tasks', { method: 'POST', body: JSON.stringify({ noteId, tasks }) }),
  },
};
