import { Router } from 'express';
import { db } from '../db/database';
import { anthropic } from '../ai/client';

const router = Router();
const settingsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateEntry(body: Record<string, unknown>): string | null {
  const { date, bedtime, wakeTime, quality, energy } = body;
  if (!date || !DATE_RE.test(String(date))) return 'date must be YYYY-MM-DD';
  if (!bedtime || !TIME_RE.test(String(bedtime))) return 'bedtime must be HH:MM';
  if (!wakeTime || !TIME_RE.test(String(wakeTime))) return 'wakeTime must be HH:MM';
  if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 1 || quality > 5)
    return 'quality must be an integer 1–5';
  if (typeof energy !== 'number' || !Number.isInteger(energy) || energy < 1 || energy > 5)
    return 'energy must be an integer 1–5';
  return null;
}

// GET /api/sleep/stats — before /:date to avoid param capture
router.get('/stats', (_req, res) => {
  res.json(db.getSleepStats());
});

// GET /api/sleep
router.get('/', (_req, res) => {
  res.json(db.getSleepEntries());
});

// POST /api/sleep/insight — generate AI weekly insight
router.post('/insight', async (_req, res) => {
  const entries = db.getSleepEntries().slice(0, 14);
  const stats = db.getSleepStats();
  const settings = db.getSleepSettings();

  const targetH = settings.sleepTarget;
  const debtMin = stats.currentSleepDebt;
  const debtH = Math.floor(debtMin / 60);
  const debtM = debtMin % 60;
  const debtLabel = debtM > 0 ? `${debtH}h ${debtM}m` : `${debtH}h`;

  const entryData = entries.map(e => ({
    date: e.date,
    durationMinutes: e.durationMinutes,
    quality: e.quality,
    energy: e.energy,
    note: e.note,
  }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You are a helpful sleep coach embedded in a personal productivity app. The user manually logs their sleep each morning. Analyze their recent sleep data and write a short, warm, and practical weekly insight.\n\nFormat your response in exactly three parts, separated by newlines:\n1. One sentence summarizing their sleep this week (positive where possible)\n2. One specific pattern you notice (good or concerning), referencing actual data from their logs\n3. One concrete, actionable suggestion for next week\n\nKeep the total response under 80 words. Be specific — reference actual times, durations, or scores from the data. Do not use bullet points or headers. Do not mention that you are an AI.`,
      messages: [{
        role: 'user',
        content: `Here is my sleep data for the last 14 nights: ${JSON.stringify(entryData)}.\nMy sleep target is ${targetH}h. My current sleep debt is ${debtLabel}. My consistency score is ${stats.consistencyScore}/100.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const today = new Date().toISOString().split('T')[0];
    db.updateSleepSettings({ aiInsightText: text, aiInsightLastGenerated: today });
    res.json({ text, generatedAt: today });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

// GET /api/sleep/:date
router.get('/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) { res.status(400).json({ error: 'date must be YYYY-MM-DD' }); return; }
  const entry = db.getSleepEntry(req.params.date);
  res.json(entry ?? null);
});

// POST /api/sleep
router.post('/', (req, res) => {
  const err = validateEntry(req.body);
  if (err) { res.status(400).json({ error: err }); return; }
  const { date, bedtime, wakeTime, quality, energy, note } = req.body;
  const entry = db.upsertSleepEntry({
    date: String(date),
    bedtime: String(bedtime),
    wakeTime: String(wakeTime),
    quality: quality as number,
    energy: energy as number,
    note: note != null ? String(note).trim() || null : null,
  });
  res.status(201).json(entry);
});

// DELETE /api/sleep/:date
router.delete('/:date', (req, res) => {
  if (!DATE_RE.test(req.params.date)) { res.status(400).json({ error: 'date must be YYYY-MM-DD' }); return; }
  if (!db.deleteSleepEntry(req.params.date)) { res.status(404).json({ error: 'entry not found' }); return; }
  res.status(204).end();
});

// GET /api/sleep-settings
settingsRouter.get('/', (_req, res) => {
  res.json(db.getSleepSettings());
});

// PATCH /api/sleep-settings
settingsRouter.patch('/', (req, res) => {
  const { sleepTarget, weekStartsOn, aiInsightLastGenerated, aiInsightText } = req.body;
  const fields: Parameters<typeof db.updateSleepSettings>[0] = {};

  if (sleepTarget !== undefined) {
    if (typeof sleepTarget !== 'number' || sleepTarget <= 0 || sleepTarget > 24) {
      res.status(400).json({ error: 'sleepTarget must be a positive number ≤ 24' }); return;
    }
    fields.sleepTarget = sleepTarget;
  }
  if (weekStartsOn !== undefined) {
    if (weekStartsOn !== 0 && weekStartsOn !== 1) {
      res.status(400).json({ error: 'weekStartsOn must be 0 or 1' }); return;
    }
    fields.weekStartsOn = weekStartsOn as 0 | 1;
  }
  if (aiInsightLastGenerated !== undefined) fields.aiInsightLastGenerated = aiInsightLastGenerated ?? null;
  if (aiInsightText !== undefined) fields.aiInsightText = aiInsightText ?? null;

  res.json(db.updateSleepSettings(fields));
});

export { router as sleepRouter, settingsRouter as sleepSettingsRouter };
