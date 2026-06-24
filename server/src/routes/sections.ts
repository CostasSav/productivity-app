import { Router } from 'express';
import { db } from '../db/database';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.getSections());
});

router.post('/', (req, res) => {
  const { name, color, source } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const section = db.createSection({ name: name.trim(), color: color ?? '#6366f1', source: source ?? null });
  res.status(201).json(section);
});

router.put('/:id', (req, res) => {
  const { name, color, source } = req.body;
  const updated = db.updateSection(Number(req.params.id), {
    ...(name !== undefined && { name }),
    ...(color !== undefined && { color }),
    ...(source !== undefined && { source }),
  });
  if (!updated) {
    res.status(404).json({ error: 'Section not found' });
    return;
  }
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const deleted = db.deleteSection(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Section not found' });
    return;
  }
  res.status(204).send();
});

export default router;
