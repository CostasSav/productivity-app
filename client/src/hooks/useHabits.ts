import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { Habit, HabitLog } from '../types';

// ── Shared keys ───────────────────────────────────────────────────────────────

const HABITS_KEY = queryKeys.habits;
// All logs with no filter — the single cache that backs every habit streak view.
const LOGS_KEY = queryKeys.habitLogs();

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<Habit, 'id' | 'createdAt' | 'archivedAt' | 'order'>) =>
      api.habits.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Omit<Habit, 'id' | 'createdAt'>> }) =>
      api.habits.update(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY);
      queryClient.setQueryData<Habit[]>(HABITS_KEY, prev =>
        (prev ?? []).map(h => (h.id === id ? { ...h, ...data } : h))
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(HABITS_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
  });
}

export function useArchiveHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.habits.archive(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY);
      queryClient.setQueryData<Habit[]>(HABITS_KEY, prev =>
        (prev ?? []).filter(h => h.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(HABITS_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
  });
}

export function useReorderHabits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => api.habits.reorder(ids),

    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: HABITS_KEY });
      const previous = queryClient.getQueryData<Habit[]>(HABITS_KEY);
      queryClient.setQueryData<Habit[]>(HABITS_KEY, prev => {
        if (!prev) return prev;
        const byId = new Map(prev.map(h => [h.id, h]));
        // Apply the new order immediately so drag reorder feels instant.
        return ids.map((id, i) => ({ ...byId.get(id)!, order: i })).filter(
          (h): h is Habit => h.id !== undefined
        );
      });
      return { previous };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(HABITS_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    },
  });
}

export function useLogHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: number; date?: string }) => {
      const completedAt = date ? `${date}T12:00:00` : undefined;
      return api.habits.createLog({ habitId, completedAt });
    },

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: LOGS_KEY });
      const previous = queryClient.getQueryData<HabitLog[]>(LOGS_KEY);

      // Add a temporary entry with a negative ID so the check-mark appears
      // instantly before the server responds.
      const tempLog: HabitLog = {
        id: -Date.now(),
        habitId,
        completedAt: date ? `${date}T12:00:00` : new Date().toISOString(),
        note: null,
      };
      queryClient.setQueryData<HabitLog[]>(LOGS_KEY, prev => [
        ...(prev ?? []),
        tempLog,
      ]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(LOGS_KEY, ctx.previous);
    },
    onSuccess: (entry, { habitId }) => {
      // Replace the temp entry (negative ID, same habitId) with the real one.
      queryClient.setQueryData<HabitLog[]>(LOGS_KEY, prev => {
        if (!prev) return [entry];
        const withoutTemp = prev.filter(l => !(l.id < 0 && l.habitId === habitId));
        return [...withoutTemp, entry];
      });
    },
    onSettled: () => {
      // Streaks depend on both the logs and the habit metadata — sync both.
      queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    },
  });
}

export function useUnlogHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (logId: number) => api.habits.deleteLog(logId),

    onMutate: async (logId) => {
      await queryClient.cancelQueries({ queryKey: LOGS_KEY });
      const previous = queryClient.getQueryData<HabitLog[]>(LOGS_KEY);
      queryClient.setQueryData<HabitLog[]>(LOGS_KEY, prev =>
        (prev ?? []).filter(l => l.id !== logId)
      );
      return { previous };
    },
    onError: (_err, _logId, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(LOGS_KEY, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LOGS_KEY });
    },
  });
}

// ── Archived habits ───────────────────────────────────────────────────────────

export function useArchivedHabits(enabled: boolean) {
  return useQuery<Habit[]>({
    queryKey: queryKeys.habitsArchived,
    queryFn: () => api.habits.listArchived(),
    enabled,
  });
}

export function useRestoreHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.habits.update(id, { archivedAt: null } as any),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.habitsArchived });
      const previous = queryClient.getQueryData<Habit[]>(queryKeys.habitsArchived);
      queryClient.setQueryData<Habit[]>(queryKeys.habitsArchived, prev =>
        prev?.filter(h => h.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.habitsArchived, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: HABITS_KEY });
      queryClient.invalidateQueries({ queryKey: queryKeys.habitsArchived });
    },
  });
}

// ── Composite hook (used by Today, Habits, SectionPage) ───────────────────────
// Returns the same interface as the old useState-based hook so all three callers
// work without changes.

export function useHabits() {
  const queryClient = useQueryClient();

  const habitsQuery = useQuery({
    queryKey: HABITS_KEY,
    queryFn: () => api.habits.list(),
  });

  const logsQuery = useQuery({
    queryKey: LOGS_KEY,
    queryFn: () => api.habits.listLogs(),
  });

  const createMutation  = useCreateHabit();
  const updateMutation  = useUpdateHabit();
  const archiveMutation = useArchiveHabit();
  const reorderMutation = useReorderHabits();
  const logMutation     = useLogHabit();
  const unlogMutation   = useUnlogHabit();

  const habits  = habitsQuery.data ?? [];
  const logs    = logsQuery.data ?? [];
  // Skeleton is shown only on the very first load — background refetches keep
  // the existing data visible while new data arrives.
  const loading = habitsQuery.isLoading || logsQuery.isLoading;

  const createHabit = (
    data: Omit<Habit, 'id' | 'createdAt' | 'archivedAt' | 'order'>,
  ): Promise<Habit> => createMutation.mutateAsync(data);

  const updateHabit = (
    id: number,
    data: Partial<Omit<Habit, 'id' | 'createdAt'>>,
  ): Promise<Habit> => updateMutation.mutateAsync({ id, data });

  const archiveHabit = (id: number): Promise<void> =>
    archiveMutation.mutateAsync(id).then(() => undefined);

  const reorderHabits = (ids: number[]): Promise<void> =>
    reorderMutation.mutateAsync(ids);

  const logHabit = (habitId: number, date?: string): Promise<void> =>
    logMutation.mutateAsync({ habitId, date }).then(() => undefined);

  const unlogHabit = (logId: number): Promise<void> =>
    unlogMutation.mutateAsync(logId);

  // reload() is kept for the Habits page's handleRestore flow which calls it
  // after restoring an archived habit via the raw api (no mutation hook).
  const reload = () => {
    queryClient.invalidateQueries({ queryKey: HABITS_KEY });
    queryClient.invalidateQueries({ queryKey: LOGS_KEY });
  };

  return {
    habits,
    logs,
    loading,
    createHabit,
    updateHabit,
    archiveHabit,
    reorderHabits,
    logHabit,
    unlogHabit,
    reload,
  };
}
