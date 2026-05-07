import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/database';
import { summarizeNote } from '../ai/summarize';
import { extractTasksFromNote } from '../ai/extractTasks';
import type { ExtractedTask } from '../ai/extractTasks';

const router = Router();

function handleAiError(err: unknown, res: any) {
  if (err instanceof Anthropic.AuthenticationError) {
    res.status(401).json({ error: 'Invalid API key. Check your ANTHROPIC_API_KEY in .env' });
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: 'Rate limited by Claude API. Try again in a moment.' });
  } else {
    console.error('[AI Error]', err);
    res.status(500).json({ error: 'AI request failed. Check server logs.' });
  }
}

router.post('/summarize', async (req, res) => {
  const { noteId } = req.body;
  if (!noteId) { res.status(400).json({ error: 'noteId is required' }); return; }
  const note = db.getNote(Number(noteId));
  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
  if (!note.content || note.content.trim().length < 20) {
    res.status(400).json({ error: 'Note content is too short to summarize.' });
    return;
  }
  try {
    const result = await summarizeNote(note.content);
    db.updateNote(Number(noteId), { summary: JSON.stringify(result) });
    res.json(result);
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post('/extract-tasks', async (req, res) => {
  const { noteId } = req.body;
  if (!noteId) { res.status(400).json({ error: 'noteId is required' }); return; }
  const note = db.getNote(Number(noteId));
  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
  if (!note.content || note.content.trim().length < 50) {
    res.status(400).json({ error: 'Note is too short for reliable task extraction (minimum 50 characters).' });
    return;
  }
  try {
    const result = await extractTasksFromNote(note.content);
    res.json(result);
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post('/confirm-tasks', (req, res) => {
  const { noteId, tasks } = req.body as { noteId: number; tasks: ExtractedTask[] };
  if (!noteId || !Array.isArray(tasks)) {
    res.status(400).json({ error: 'noteId and tasks array are required' });
    return;
  }
  // Inherit section from the source note
  const sourceNote = db.getNote(Number(noteId));
  const section_id = sourceNote?.section_id ?? null;
  for (const task of tasks) {
    const created = db.createTask({
      title: task.title,
      priority: task.priority,
      deadline: task.deadline ?? null,
      note_id: noteId,
      section_id,
      description: null,
      status: 'todo',
      recurrence: null,
      recurrence_day: null,
      recurrence_time: null,
      subtasks: [],
      pinnedToday: false,
      pinnedAt: null,
    });
    for (const subtitle of task.subtasks ?? []) {
      db.addSubtask(created.id, subtitle);
    }
  }
  res.json({ inserted: tasks.length });
});

export default router;
