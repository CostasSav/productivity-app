import { Router, type Request, type RequestHandler } from 'express';
import session from 'express-session';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import { FileSessionStore } from '../auth/fileStore';
import type { AuthConfig } from '../auth/config';
import { verifyPassword } from '../auth/password';

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const unsafe = (req: Request) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

export function createAuth(config: AuthConfig) {
  const store = new FileSessionStore(config.sessionDir);
  const name = config.secure ? '__Host-workspace.sid' : 'workspace.sid';
  const cookie = { secure: config.secure, httpOnly: true, sameSite: 'lax' as const, path: '/' };
  const authVersion = createHmac('sha256', config.sessionSecret).update(config.passwordHash).digest('hex');
  const authenticated = (req: Request) => req.session?.owner === true && (req.session.expiresAt ?? 0) > Date.now() && req.session.authVersion === authVersion;
  const originAllowed = (req: Request) => config.origins.includes(req.get('origin') ?? '');
  const csrfValid = (req: Request) => originAllowed(req) && !!req.session?.csrfToken && equal(req.get('x-csrf-token') ?? '', req.session.csrfToken);
  const middleware = session({ name, secret: config.sessionSecret, store, resave: false, saveUninitialized: false,
    cookie: { ...cookie, maxAge: 15 * 60000 } });
  const router = Router();
  // Global budgets are deliberate for a single owner: spoofed forwarded IPs
  // cannot bypass them. Counters reset on process restart.
  router.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: () => 'owner-auth', standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many requests. Try again later.' } }));
  const loginLimit = rateLimit({ windowMs: 15 * 60000, limit: 10, keyGenerator: () => 'owner-login', standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' } });
  const guard: RequestHandler = (req, res, next) => {
    if (!csrfValid(req)) { res.status(403).json({ error: 'Request rejected' }); return; }
    next();
  };
  router.get('/session', (req, res, next) => {
    if ((req.get('origin') && !originAllowed(req)) || req.get('sec-fetch-site') === 'cross-site') {
      res.status(403).json({ error: 'Request rejected' }); return;
    }
    const finish = () => {
      if (!req.session.csrfToken) {
        req.session.csrfToken = randomBytes(32).toString('hex');
        req.session.expiresAt = Date.now() + 15 * 60000;
      }
      req.session.save(error => error ? next(error) : res.json({ authenticated: authenticated(req), csrfToken: req.session.csrfToken }));
    };
    if (req.session.owner && !authenticated(req)) req.session.regenerate(error => error ? next(error) : finish());
    else finish();
  });
  router.post('/login', loginLimit, guard, async (req, res, next) => {
    try {
      const password = req.body?.password;
      if (typeof password !== 'string' || password.length > 1024 || !await verifyPassword(password, config.passwordHash)) {
        res.status(401).json({ error: 'Unable to sign in' }); return;
      }
      req.session.regenerate(error => {
        if (error) return next(error);
        req.session.owner = true;
        req.session.authVersion = authVersion;
        req.session.csrfToken = randomBytes(32).toString('hex');
        req.session.expiresAt = Date.now() + config.sessionTtlMs;
        req.session.cookie.maxAge = config.sessionTtlMs;
        req.session.save(error => error ? next(error) : res.json({ authenticated: true, csrfToken: req.session.csrfToken }));
      });
    } catch { next(new Error('Authentication unavailable')); }
  });
  router.post('/logout', guard, (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie(name, cookie).status(204).end();
    });
  });
  const requireAuth: RequestHandler = (req, res, next) => {
    const header = req.get('authorization') ?? '';
    if (config.legacyToken && Date.now() < config.legacyExpiresAt && header.startsWith('Bearer ') && equal(header.slice(7), config.legacyToken)) {
      // Explicit bearer requests do not use ambient cookie authentication.
      if (req.get('origin') && !originAllowed(req)) { res.status(403).json({ error: 'Request rejected' }); return; }
      next(); return;
    }
    if (authenticated(req)) {
      if (unsafe(req) && !csrfValid(req)) { res.status(403).json({ error: 'Request rejected' }); return; }
      next(); return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  };
  return { middleware, router, requireAuth };
}
