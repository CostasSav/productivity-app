import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import tasksRouter from './routes/tasks';
import notesRouter from './routes/notes';
import aiRouter from './routes/ai';
import sectionsRouter from './routes/sections';
import pomodoroSessionsRouter from './routes/pomodoroSessions';
import habitsRouter from './routes/habits';
import habitLogsRouter from './routes/habitLogs';
import { gratitudeRouter, gratitudeSettingsRouter } from './routes/gratitude';
import { groceryRouter, groceryStaplesRouter } from './routes/grocery';
import { sleepRouter, sleepSettingsRouter } from './routes/sleep';
import { booksRouter, bookNotesRouter, bookQuotesRouter, bookLearningsRouter, bibliothecaSettingsRouter } from './routes/bibliotheca';
import { db, flushMigrations } from './db/database';
import { requireAuth } from './middleware/auth';

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
flushMigrations();
db.unpinStaleTasks();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Security hardening ────────────────────────────────
app.use(helmet());

// Lock CORS to the deployed frontend origin. Comma-separate multiple origins.
// Falls back to permissive CORS in local dev when ALLOWED_ORIGINS is unset.
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins?.length ? { origin: allowedOrigins } : {}));

// Cap request body size (defense against memory abuse on the JSON-file DB)
app.use(express.json({ limit: '1mb' }));

// All API routes require the bearer token (see middleware/auth.ts)
app.use('/api', requireAuth);

// Strict rate limit on AI routes — these spend your Anthropic credits
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
// General limit on everything else
const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
app.use('/api/ai', aiLimiter);
app.use('/api', apiLimiter);

app.use('/api/sections', sectionsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notes', notesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/pomodoro-sessions', pomodoroSessionsRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/habit-logs', habitLogsRouter);
app.use('/api/gratitude', gratitudeRouter);
app.use('/api/gratitude-settings', gratitudeSettingsRouter);
app.use('/api/grocery/staples', groceryStaplesRouter);
app.use('/api/grocery', groceryRouter);
app.use('/api/sleep-settings', sleepSettingsRouter);
app.use('/api/sleep', sleepRouter);
app.use('/api/bibliotheca-settings', bibliothecaSettingsRouter);
app.use('/api/books', booksRouter);
app.use('/api/book-notes', bookNotesRouter);
app.use('/api/book-quotes', bookQuotesRouter);
app.use('/api/book-learnings', bookLearningsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
