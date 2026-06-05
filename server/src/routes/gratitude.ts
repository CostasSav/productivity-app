import { Router } from 'express';
import { db } from '../db/database';

const router = Router();
const settingsRouter = Router();

// GET /api/gratitude
router.get('/', (_req, res) => {
  res.json(db.getGratitudeEntries());
});

// GET /api/gratitude/today
router.get('/today', (_req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.json(db.getTodayGratitudeEntry(today));
});

// GET /api/gratitude/stats
router.get('/stats', (_req, res) => {
  const settings = db.getGratitudeSettings();
  const entries = db.getGratitudeEntries();
  res.json({
    currentStreak: settings.currentStreak,
    totalEntries: settings.totalEntries,
    longestStreak: settings.longestStreak,
    completedDates: entries.map(e => e.date),
  });
});

// POST /api/gratitude — create or update today's entry
router.post('/', (req, res) => {
  const { items, mood, completedAt, durationSeconds } = req.body;

  if (!Array.isArray(items) || items.length !== 3 || items.some((i: unknown) => typeof i !== 'string')) {
    res.status(400).json({ error: 'items must be an array of exactly 3 strings' });
    return;
  }
  if (typeof durationSeconds !== 'number' || durationSeconds < 0) {
    res.status(400).json({ error: 'durationSeconds must be a non-negative number' });
    return;
  }
  if (mood !== undefined && mood !== null && (typeof mood !== 'number' || mood < 1 || mood > 5 || !Number.isInteger(mood))) {
    res.status(400).json({ error: 'mood must be an integer 1-5 or null' });
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const entry = db.saveGratitudeEntry({
    date: today,
    items,
    mood: mood ?? null,
    completedAt: completedAt ?? new Date().toISOString(),
    durationSeconds,
  });

  res.json(entry);
});

// GET /api/gratitude-settings
settingsRouter.get('/', (_req, res) => {
  res.json(db.getGratitudeSettings());
});

// PATCH /api/gratitude-settings
settingsRouter.patch('/', (req, res) => {
  const { reminderEnabled, reminderTime, onboardingComplete, resetStreak } = req.body;

  if (reminderTime !== undefined && !/^\d{2}:\d{2}$/.test(reminderTime)) {
    res.status(400).json({ error: 'reminderTime must be "HH:MM"' });
    return;
  }

  const updated = db.updateGratitudeSettings({
    ...(reminderEnabled !== undefined && { reminderEnabled: Boolean(reminderEnabled) }),
    ...(reminderTime !== undefined && { reminderTime }),
    ...(onboardingComplete !== undefined && { onboardingComplete: Boolean(onboardingComplete) }),
    ...(resetStreak === true && { currentStreak: 0 }),
  });
  res.json(updated);
});

export { router as gratitudeRouter, settingsRouter as gratitudeSettingsRouter };
