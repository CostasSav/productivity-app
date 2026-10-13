import { Router } from 'express';
import { validBearer } from './bearer';
import { createActionRouter } from './actions';
import rateLimit from 'express-rate-limit';
import type { WidgetConfig } from './config';
import { buildWidgetSnapshot, type WidgetData } from './snapshot';

export interface WidgetOptions {
  config: WidgetConfig | null; read: () => WidgetData; now?: () => Date;
  actionConfig?: WidgetConfig | null;
  complete?: (kind: 'tasks' | 'habits', id: number, date: string, completed: boolean, zone: string, instant: Date, expectedUpdatedAt?: string) => unknown;
}
export function createWidgetRouter(options: WidgetOptions) {
  const router = Router();
  const now = options.now ?? (() => new Date());
  const actions = createActionRouter(options);
  router.use((req, res, next) => {
    if (/^\/(tasks|habits)(\/|$)/.test(req.path)) actions(req, res, next);
    else next();
  });
  // Single-owner global budget also limits invalid attempts, independent of proxy IPs.
  router.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: () => 'widget-read',
    standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Try again later.' } }));
  router.use((req, res, next) => {
    if (!validBearer(req.get('authorization'), options.config, now())) {
      res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Unauthorized' }); return;
    }
    if (req.method !== 'GET') { res.status(403).json({ error: 'Forbidden' }); return; }
    next();
  });
  router.get('/today', (_req, res) => {
    try { res.json(buildWidgetSnapshot(options.read(), options.config!.timeZone, now())); }
    catch { res.status(503).json({ error: 'Widget data unavailable. Try again later.' }); }
  });
  // Never fall through into the browser-authenticated API namespace.
  router.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  return router;
}
