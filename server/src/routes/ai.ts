import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/database';
import { anthropic } from '../ai/client';
import { summarizeNote } from '../ai/summarize';
import { extractTasksFromNote } from '../ai/extractTasks';
import type { ExtractedTask } from '../ai/extractTasks';

const router = Router();

function handleAiError(err: unknown, res: any) {
  console.error('[AI Error]', err);
  if (err instanceof Anthropic.AuthenticationError) {
    res.status(401).json({ error: 'AI service is not configured correctly.' }); // details stay in server logs
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: 'Rate limited by Claude API. Try again in a moment.' });
  } else {
    res.status(500).json({ error: 'AI request failed.' });
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

router.post('/explain-term', async (req, res) => {
  const { term } = req.body;
  if (!term || typeof term !== 'string' || !term.trim()) {
    res.status(400).json({ error: 'term is required' }); return;
  }
  if (term.trim().length > 100) {
    res.status(400).json({ error: 'term must be under 100 characters' }); return;
  }
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Explain the concept or word "${term.trim()}" in 2–3 simple sentences as if explaining to a curious adult. Be concrete and give one real-world example. Do not use the word itself in the definition. Respond with only the explanation, no preamble, no quotation marks around the explanation.`,
      }],
    });
    const explanation = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? '';
    res.json({ explanation });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post('/quiz-insight', async (req, res) => {
  const { score, total, missedTerms } = req.body as {
    score: number;
    total: number;
    missedTerms: Array<{ term: string; definition: string }>;
  };
  if (typeof score !== 'number' || typeof total !== 'number' || !Array.isArray(missedTerms)) {
    res.status(400).json({ error: 'score, total, and missedTerms are required' }); return;
  }
  if (missedTerms.length === 0) {
    res.json({ insight: 'Outstanding — you recalled every single term perfectly.' }); return;
  }
  try {
    const missedList = missedTerms.map(t => `- ${t.term}: ${t.definition}`).join('\n');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: [
        {
          type: 'text',
          text: `You are a learning coach helping someone review vocabulary and concepts from books they have read.\n\nThe user missed these terms in their quiz:\n${missedList}`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `The user scored ${score} out of ${total} on their retention quiz. Write 2 sentences maximum: one acknowledging their score warmly, and one practical tip for better retaining the specific concepts they missed. Be concise and encouraging, not generic.`,
        },
      ],
    });
    const insight = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? '';
    res.json({ insight });
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
