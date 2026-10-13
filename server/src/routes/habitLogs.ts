import { Router } from 'express';
import { db } from '../db/database';
import { completionError } from '../middleware/completionError';

const router = Router();

router.get('/', (req, res) => {
  const { habitId, from, to } = req.query;
  const logs = db.getHabitLogs({
    habitId: habitId != null ? Number(habitId) : undefined,
    from: from != null ? String(from) : undefined,
    to: to != null ? String(to) : undefined,
  });
  res.json(logs);
});

router.post('/', (req, res) => {
  const { habitId, completedAt, note } = req.body;
  if (!Number.isSafeInteger(Number(habitId)) || Number(habitId) < 1) return res.status(400).json({ error: 'valid habitId is required' });
  const log = db.createHabitLog({
    habitId: Number(habitId),
    completedAt: completedAt != null ? String(completedAt) : new Date().toISOString(),
    note: note != null ? String(note) : null,
  });
  res.status(201).json(log);
});

router.delete('/:id', (req, res) => {
  const deleted = db.deleteHabitLog(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Log entry not found' });
  res.status(204).send();
});

router.use(completionError);
export default router;
