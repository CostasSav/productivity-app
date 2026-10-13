import { Router } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import type { WidgetConfig } from './config';
import { buildWidgetSnapshot, type WidgetData } from './snapshot';

export interface WidgetOptions { config: WidgetConfig | null; read: () => WidgetData; now?: () => Date }
export function createWidgetRouter(options: WidgetOptions) {
  const router = Router();
  const now = options.now ?? (() => new Date());
  // Single-owner global budget also limits invalid attempts, independent of proxy IPs.
  router.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: () => 'widget-read',
    standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Try again later.' } }));
  router.use((req, res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('authorization') ?? '');
    const config = options.config;
    const digest = createHash('sha256').update(match?.[1] ?? '').digest();
    const expected = Buffer.from(config?.digest ?? '00'.repeat(32), 'hex');
    const equal = expected.length === digest.length && timingSafeEqual(digest, expected);
    if (!match || !config || !equal || now().getTime() >= config.expiresAt) {
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
