import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { PomodoroSession } from '../types';

interface PomodoroSessionCounts {
  totalByTaskId: Record<number, number>;
  todayByTaskId: Record<number, number>;
}

export function usePomodoroSessions(): PomodoroSessionCounts {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.pomodoroSessions.list();
      setSessions(data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.addEventListener('pomodoro-session-complete', load);
    return () => window.removeEventListener('pomodoro-session-complete', load);
  }, [load]);

  const today = new Date().toISOString().split('T')[0];
  const totalByTaskId: Record<number, number> = {};
  const todayByTaskId: Record<number, number> = {};

  for (const s of sessions) {
    if (s.type !== 'work' || s.taskId == null) continue;
    totalByTaskId[s.taskId] = (totalByTaskId[s.taskId] ?? 0) + 1;
    if (s.completedAt.startsWith(today)) {
      todayByTaskId[s.taskId] = (todayByTaskId[s.taskId] ?? 0) + 1;
    }
  }

  return { totalByTaskId, todayByTaskId };
}
