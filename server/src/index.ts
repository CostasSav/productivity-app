import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import { db, flushMigrations } from './db/database';

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
flushMigrations();
db.unpinStaleTasks();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
