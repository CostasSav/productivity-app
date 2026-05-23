import { useState, useEffect, useCallback } from 'react';
import type { Habit, HabitLog } from '../types';
import { api } from '../api';

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [h, l] = await Promise.all([api.habits.list(), api.habits.listLogs()]);
    setHabits(h);
    setLogs(l);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createHabit = async (data: Omit<Habit, 'id' | 'createdAt' | 'archivedAt' | 'order'>) => {
    const habit = await api.habits.create(data);
    setHabits(prev => [...prev, habit]);
    return habit;
  };

  const updateHabit = async (id: number, data: Partial<Omit<Habit, 'id' | 'createdAt'>>) => {
    const habit = await api.habits.update(id, data);
    setHabits(prev => prev.map(h => h.id === id ? habit : h));
    return habit;
  };

  const archiveHabit = async (id: number) => {
    await api.habits.archive(id);
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const reorderHabits = async (ids: number[]) => {
    await api.habits.reorder(ids);
    setHabits(prev => {
      const byId = new Map(prev.map(h => [h.id, h]));
      return ids.map((id, i) => ({ ...byId.get(id)!, order: i })).filter(Boolean);
    });
  };

  const logHabit = async (habitId: number, date?: string) => {
    const completedAt = date ? `${date}T12:00:00` : undefined;
    const entry = await api.habits.createLog({ habitId, completedAt });
    setLogs(prev => [...prev, entry]);
  };

  const unlogHabit = async (logId: number) => {
    await api.habits.deleteLog(logId);
    setLogs(prev => prev.filter(l => l.id !== logId));
  };

  return { habits, logs, loading, createHabit, updateHabit, archiveHabit, reorderHabits, logHabit, unlogHabit, reload: load };
}
