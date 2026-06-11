import type { Request, Response, NextFunction } from 'express';

/**
 * Simple bearer-token auth for a single-user deployment.
 * Set APP_TOKEN in your .env (e.g. a long random string from `openssl rand -hex 32`).
 * The client must send:  Authorization: Bearer <token>
 *
 * If APP_TOKEN is not set, the middleware refuses all requests in production
 * and allows everything in development (so local dev keeps working unchanged).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.APP_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Server misconfigured: APP_TOKEN is not set.' });
      return;
    }
    next(); // local dev without a token
    return;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token || !timingSafeEqualStr(token, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// Constant-time comparison to avoid timing attacks on the token
import { timingSafeEqual } from 'crypto';
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
