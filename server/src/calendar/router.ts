import { Router } from 'express';
import type { CalendarService } from './service';

export const MAX_RANGE_DAYS = 62;
const DAY = 86400000;

function parseDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

// Mounted under /api, so the global auth, CSRF and rate-limit boundary applies.
export function createCalendarRouter(calendar: CalendarService) {
  const router = Router();

  // GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD — inclusive UTC days.
  router.get('/events', (req, res) => {
    const from = parseDay(req.query.from), to = parseDay(req.query.to);
    if (from === null || to === null) { res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' }); return; }
    if (to < from) { res.status(400).json({ error: 'to must not be before from' }); return; }
    if ((to - from) / DAY + 1 > MAX_RANGE_DAYS) { res.status(400).json({ error: `range must not exceed ${MAX_RANGE_DAYS} days` }); return; }
    res.json(calendar.snapshot(new Date(from), new Date(to + DAY)));
  });

  // POST /api/calendar/refresh — waits for the refresh and returns feed statuses only.
  router.post('/refresh', async (_req, res) => {
    if (!calendar.enabled) { res.status(409).json({ error: 'Calendar feeds are not configured' }); return; }
    const run = calendar.manualRefresh();
    if (!run) {
      res.set('Retry-After', String(calendar.retryAfterSeconds())).status(429).json({ error: 'Refresh limited to once per minute' });
      return;
    }
    try {
      await run;
      res.json({ enabled: true, feeds: calendar.snapshot().feeds });
    } catch {
      res.status(503).json({ error: 'Calendar refresh unavailable. Try again later.' });
    }
  });

  return router;
}
