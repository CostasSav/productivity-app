import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createApiApp } from '../src/app';
import { hashPassword } from '../src/auth/password';

// Optional local browser smoke fixture. No dotenv, database or route imports.
async function main() {
  const directory = mkdtempSync(path.join(tmpdir(), 'workspace-auth-preview-'));
  const app = createApiApp({ passwordHash: await hashPassword('synthetic-preview-password'), sessionSecret: 'ef'.repeat(32),
    sessionDir: directory, sessionTtlMs: 86400000, secure: false, origins: ['http://localhost:4173'], trustProxy: false, legacyExpiresAt: 0 });
  app.get('/api/gratitude/today', (_req, res) => res.json(null));
  app.get('/api/gratitude/stats', (_req, res) => res.json({ currentStreak: 0, totalEntries: 0, longestStreak: 0, completedDates: [] }));
  app.get('/api/sleep/stats', (_req, res) => res.json({}));
  app.get('/api/sleep/:date', (_req, res) => res.json(null));
  app.use('/api', (_req, res) => res.json([]));
  const server = app.listen(3001, '127.0.0.1', () => console.log('Synthetic authentication fixture ready on port 3001; no productivity database loaded.'));
  const cleanup = () => {
    server.closeAllConnections();
    server.close(() => {
      if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('workspace-auth-preview-')) throw new Error('Unexpected temporary path');
      rmSync(directory, { recursive: true, force: true });
      process.exit();
    });
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
main().catch(() => { console.error('Synthetic fixture failed'); process.exitCode = 1; });
