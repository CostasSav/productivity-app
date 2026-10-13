import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { AuthConfig } from './auth/config';
import { createAuth } from './middleware/auth';
import { createWidgetRouter, type WidgetOptions } from './widgets/router';

// No database imports or startup side effects: tests use synthetic route handlers.
export function createApiApp(config: AuthConfig, widgets: WidgetOptions = { config: null, read: () => { throw new Error(); } }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use('/api', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Vercel-CDN-Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' });
    next();
  });
  app.use(cors({ origin: config.origins, credentials: true }));
  app.use('/api/widgets', createWidgetRouter(widgets));
  app.use(express.json({ limit: '1mb' }));
  const auth = createAuth(config);
  app.use('/api', auth.middleware);
  app.use('/api/auth', auth.router);
  // This boundary protects ALL existing and future /api routes by default.
  app.use('/api', auth.requireAuth);
  const authError: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(503).json({ error: 'Request unavailable. Try again later.' });
  };
  app.use(authError);
  app.use('/api/ai', rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  return app;
}
