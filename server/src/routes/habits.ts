import { Router } from 'express';
import { db } from '../db/database';
import type { HabitFrequency } from '../types';

const router = Router();

router.get('/', (req, res) => {
  if (req.query.archived === 'true') {
    return res.json(db.getArchivedHabits());
  }
  res.json(db.getHabits());
});

router.post('/', (req, res) => {
  const { name, description, sectionId, color, icon, frequency, targetDays, targetCount } = req.body;
  if (!name || !color || !icon || !frequency) {
    return res.status(400).json({ error: 'name, color, icon, and frequency are required' });
  }
  const habit = db.createHabit({
    name: String(name),
    description: description != null ? String(description) : null,
    sectionId: sectionId != null ? Number(sectionId) : null,
    color: String(color),
    icon: String(icon),
    frequency: frequency as HabitFrequency,
    targetDays: Array.isArray(targetDays) ? (targetDays as unknown[]).map(Number) : [],
    targetCount: targetCount != null ? Number(targetCount) : null,
  });
  res.status(201).json(habit);
});

// Must be before /:id to avoid reorder being treated as an id
router.patch('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  db.reorderHabits((ids as unknown[]).map(Number));
  res.status(204).end();
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = db.updateHabit(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Habit not found' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const updated = db.updateHabit(id, { archivedAt: new Date().toISOString() });
  if (!updated) return res.status(404).json({ error: 'Habit not found' });
  res.json(updated);
});

export default router;
