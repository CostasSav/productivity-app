import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { Task } from '../types';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.tasks.list();
      setTasks(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTask = async (data: Partial<Task>) => {
    const task = await api.tasks.create(data);
    setTasks(prev => sortTasks([task, ...prev]));
    return task;
  };

  const updateTask = async (id: number, data: Partial<Task>) => {
    const { task, nextTask } = await api.tasks.update(id, data);
    setTasks(prev => {
      const updated = prev.map(t => (t.id === id ? task : t));
      return sortTasks(nextTask ? [...updated, nextTask] : updated);
    });
    return task;
  };

  const deleteTask = async (id: number) => {
    await api.tasks.delete(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const replaceTask = (updated: Task) =>
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));

  const addSubtask = async (taskId: number, title: string) => {
    const { task } = await api.tasks.addSubtask(taskId, title);
    replaceTask(task);
  };

  const toggleSubtask = async (taskId: number, subId: number, done: boolean) => {
    const { task } = await api.tasks.updateSubtask(taskId, subId, { status: done ? 'done' : 'todo' });
    replaceTask(task);
  };

  const deleteSubtask = async (taskId: number, subId: number) => {
    const { task } = await api.tasks.deleteSubtask(taskId, subId);
    replaceTask(task);
  };

  return { tasks, loading, error, reload: load, createTask, updateTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask };
}

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
