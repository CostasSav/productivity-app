import { Router } from 'express';
import { db } from '../db/database';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.getPomodoroSessions());
});

router.post('/', (req, res) => {
  const { taskId, taskTitle, startedAt, completedAt, type } = req.body;
  if (!taskTitle?.trim() || !startedAt || !completedAt || !['work', 'break'].includes(type)) {
    res.status(400).json({ error: 'taskTitle, startedAt, completedAt, and type are required' });
    return;
  }
  const session = db.createPomodoroSession({
    taskId: taskId != null ? Number(taskId) : null,
    taskTitle: taskTitle.trim(),
    startedAt,
    completedAt,
    type,
  });
  res.status(201).json(session);
});

export default router;
