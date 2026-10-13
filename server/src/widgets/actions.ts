import express, { Router, type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { WidgetOptions } from './router';
import { validBearer } from './bearer';
import { calendarDay, CompletionError } from '../db/completion';

export function createActionRouter(options: WidgetOptions) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60000, limit: 30, keyGenerator: () => 'widget-actions', standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' } }));
  router.use((req, res, next) => {
    const instant = options.now?.() ?? new Date();
    if (!req.secure) { res.status(403).json({ error: 'HTTPS_REQUIRED' }); return; }
    const action = options.actionConfig;
    if (!action || action.digest === options.config?.digest) { res.status(401).json({ error: 'Unauthorized' }); return; }
    if (!validBearer(req.get('authorization'), action, instant)) {
      res.status(validBearer(req.get('authorization'), options.config, instant) ? 403 : 401).json({ error: 'Unauthorized' }); return;
    }
    next();
  });
  router.use(express.json({ limit: '2kb', strict: true }));
  router.use((req, res) => {
    const match = /^\/(tasks|habits)\/([1-9]\d*)\/completion\/?$/.exec(req.path);
    if (!match) { res.status(400).json({ error: 'INVALID_ACTION_PATH' }); return; }
    const kind = match[1] as 'tasks' | 'habits';
    if (req.method !== (kind === 'tasks' ? 'PATCH' : 'PUT')) { res.status(403).json({ error: 'Forbidden' }); return; }
    const id = Number(match[2]);
    const body = req.body;
    const allowed = kind === 'tasks' ? ['date', 'completed', 'expectedUpdatedAt'] : ['date', 'completed'];
    if (!Number.isSafeInteger(id) || !req.is('application/json') || !body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).some(k => !allowed.includes(k)) || !calendarDay(body.date) || typeof body.completed !== 'boolean' ||
      (body.expectedUpdatedAt !== undefined && (typeof body.expectedUpdatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))))) {
      res.status(400).json({ error: 'INVALID_PAYLOAD' }); return;
    }
    try {
      if (!options.complete) throw new Error();
      res.json(options.complete(kind, id, body.date, body.completed, options.actionConfig!.timeZone, options.now?.() ?? new Date(), body.expectedUpdatedAt));
    } catch (error) {
      if (error instanceof CompletionError) res.status(error.status).json({ error: error.code });
      else res.status(503).json({ error: 'COMPLETION_UNAVAILABLE' });
    }
  });
  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(400).json({ error: 'INVALID_JSON' }); };
  router.use(errorHandler);
  return router;
}
