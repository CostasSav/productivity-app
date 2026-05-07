import { Router } from 'express';
import { db } from '../db/database';

const router = Router();

router.get('/', (req, res) => {
  const sectionId = req.query.section_id !== undefined ? Number(req.query.section_id) : undefined;
  res.json(db.getNotes(sectionId));
});

router.get('/:id', (req, res) => {
  const note = db.getNote(Number(req.params.id));
  if (!note) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json(note);
});

router.post('/', (req, res) => {
  const { title, content, section_id } = req.body;
  const note = db.createNote({ title, content, section_id: section_id ?? null });
  res.status(201).json(note);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { title, content, section_id } = req.body;
  const updated = db.updateNote(id, {
    ...(title !== undefined && { title }),
    ...(content !== undefined && { content }),
    ...(section_id !== undefined && { section_id }),
  });
  if (!updated) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const deleted = db.deleteNote(Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.status(204).send();
});

export default router;
