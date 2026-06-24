import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { Task } from '../types';

// ── Shared helpers ────────────────────────────────────────────────────────────

const TASK_KEY = queryKeys.tasks;

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return b.created_at < a.created_at ? -1 : 1;
  });
}

// Replace one task in the cache and insert nextTask if it doesn't exist yet.
function applyUpdate(prev: Task[], updated: Task, nextTask: Task | null): Task[] {
  const replaced = prev.map(t => (t.id === updated.id ? updated : t));
  const withNext =
    nextTask && !replaced.some(t => t.id === nextTask.id)
      ? [...replaced, nextTask]
      : replaced;
  return sortTasks(withNext);
}

// ── Standalone mutation hooks ─────────────────────────────────────────────────
// These are exported so callers that don't need the full useTasks() bundle can
// import just the hook they need (useful for prompt 3+).

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task>) => api.tasks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEY });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Task> }) =>
      api.tasks.update(id, data),

    onMutate: async ({ id, data }) => {
      // Stop any in-flight refetch from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: TASK_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASK_KEY);
      queryClient.setQueryData<Task[]>(TASK_KEY, prev =>
        sortTasks((prev ?? []).map(t => (t.id === id ? { ...t, ...data } : t)))
      );
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(TASK_KEY, ctx.previous);
    },

    onSuccess: ({ task, nextTask }) => {
      // Replace with the authoritative server response (handles recurrence nextTask).
      queryClient.setQueryData<Task[]>(TASK_KEY, prev =>
        applyUpdate(prev ?? [], task, nextTask)
      );
    },

    onSettled: () => {
      // Resync in the background in case the server made additional changes.
      queryClient.invalidateQueries({ queryKey: TASK_KEY });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tasks.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TASK_KEY });
      const previous = queryClient.getQueryData<Task[]>(TASK_KEY);
      queryClient.setQueryData<Task[]>(TASK_KEY, prev =>
        (prev ?? []).filter(t => t.id !== id)
      );
      return { previous };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(TASK_KEY, ctx.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: TASK_KEY });
    },
  });
}

// ── Composite hook (used by TasksContext) ─────────────────────────────────────
// Returns the same interface as the old useState-based hook so TasksContext and
// every consumer (TaskList, SectionPage, Today, CalendarView, CommandPalette)
// work without any changes.

export function useTasks() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: TASK_KEY,
    queryFn: () => api.tasks.list(),
  });

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  // ── Cache helper for subtask responses ──────────────────────────────────
  function applySubtaskResult(result: { task: Task; nextTask: Task | null }) {
    queryClient.setQueryData<Task[]>(TASK_KEY, prev =>
      applyUpdate(prev ?? [], result.task, result.nextTask)
    );
  }

  // ── Public API (same shape as before) ───────────────────────────────────
  const tasks = query.data ?? [];

  // isLoading is true only before the first successful fetch (no cached data).
  // isFetching is also true during background refetches — we intentionally do
  // NOT surface that as "loading" so the UI never flashes a spinner on cache hits.
  const loading = query.isLoading;

  const error = query.error ? (query.error as Error).message : null;

  const reload = () => queryClient.invalidateQueries({ queryKey: TASK_KEY });

  const createTask = async (data: Partial<Task>): Promise<Task> =>
    createMutation.mutateAsync(data);

  const updateTask = async (id: number, data: Partial<Task>): Promise<Task> => {
    const { task } = await updateMutation.mutateAsync({ id, data });
    return task;
  };

  const deleteTask = async (id: number): Promise<void> =>
    deleteMutation.mutateAsync(id);

  const addSubtask = async (taskId: number, title: string): Promise<void> => {
    const result = await api.tasks.addSubtask(taskId, title);
    applySubtaskResult(result);
  };

  const toggleSubtask = async (taskId: number, subId: number, done: boolean): Promise<void> => {
    const result = await api.tasks.updateSubtask(taskId, subId, {
      status: done ? 'done' : 'todo',
    });
    applySubtaskResult(result);
  };

  const deleteSubtask = async (taskId: number, subId: number): Promise<void> => {
    const result = await api.tasks.deleteSubtask(taskId, subId);
    applySubtaskResult(result);
  };

  return {
    tasks,
    loading,
    error,
    reload,
    createTask,
    updateTask,
    deleteTask,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
  };
}
