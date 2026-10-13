import 'dotenv/config';
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
import { db, prepareDatabase } from './db/database';
import { readWidgetConfig, readWidgetActionConfig } from './widgets/config';
import { readAuthConfig } from './auth/config';
import { createApiApp } from './app';

// Validate authentication before any startup database work.
const app = createApiApp(readAuthConfig(), { config: readWidgetConfig(), read: () => db.getWidgetData(),
  actionConfig: readWidgetActionConfig(), complete: (...args) => db.widgetCompletion(...args) });

prepareDatabase();

const PORT = process.env.PORT ?? 3001;

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
