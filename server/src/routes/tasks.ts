import { Router } from 'express';
import { db } from '../db/database';
import type { Priority, TaskStatus, RecurrenceType } from '../types';

const router = Router();

router.get('/', (req, res) => {
  const sectionId = req.query.section_id !== undefined ? Number(req.query.section_id) : undefined;
  res.json(db.getTasks(sectionId));
});

router.post('/', (req, res) => {
  const { title, description, priority, deadline, note_id, section_id, recurrence, recurrence_day, recurrence_time } = req.body;
  if (!title?.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const task = db.createTask({
    title: title.trim(),
    description: description ?? null,
    priority: priority ?? 'medium',
    deadline: deadline ?? null,
    note_id: note_id ?? null,
    section_id: section_id ?? null,
    status: 'todo',
    recurrence: recurrence ?? null,
    recurrence_day: recurrence_day ?? null,
    recurrence_time: recurrence_time ?? null,
    subtasks: [],
    pinnedToday: false,
    pinnedAt: null,
  });
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { title, description, status, priority, deadline, section_id, recurrence, recurrence_day, recurrence_time, pinnedToday } = req.body;
  const result = db.updateTask(id, {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(status !== undefined && { status: status as TaskStatus }),
    ...(priority !== undefined && { priority: priority as Priority }),
    ...(deadline !== undefined && { deadline }),
    ...(section_id !== undefined && { section_id }),
    ...(recurrence !== undefined && { recurrence: recurrence as RecurrenceType | null }),
    ...(recurrence_day !== undefined && { recurrence_day }),
    ...(recurrence_time !== undefined && { recurrence_time }),
    ...(pinnedToday !== undefined && { pinnedToday: Boolean(pinnedToday) }),
  });
  if (!result) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(result);
});

router.delete('/:id', (req, res) => {
  const deleted = db.deleteTask(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).send();
});

// ── Subtask routes ────────────────────────────────────

router.post('/:id/subtasks', (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title is required' }); return; }
  const task = db.addSubtask(Number(req.params.id), title.trim());
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.status(201).json({ task, nextTask: null });
});

router.patch('/:id/subtasks/:subId', (req, res) => {
  const { title, status } = req.body;
  const task = db.updateSubtask(Number(req.params.id), Number(req.params.subId), {
    ...(title !== undefined && { title }),
    ...(status !== undefined && { status }),
  });
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ task, nextTask: null });
});

router.delete('/:id/subtasks/:subId', (req, res) => {
  const task = db.deleteSubtask(Number(req.params.id), Number(req.params.subId));
  if (!task) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ task, nextTask: null });
});

export default router;
