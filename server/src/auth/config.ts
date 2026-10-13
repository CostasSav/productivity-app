import path from 'path';
import { validatePasswordHash } from './password';

export interface AuthConfig {
  passwordHash: string;
  sessionSecret: string;
  sessionDir: string;
  sessionTtlMs: number;
  secure: boolean;
  origins: string[];
  trustProxy: false | number | string[];
  legacyToken?: string;
  legacyExpiresAt: number;
}
export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const passwordHash = env.AUTH_PASSWORD_HASH ?? '';
  validatePasswordHash(passwordHash);
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (!/^[a-f0-9]{64,}$/i.test(sessionSecret)) throw new Error('SESSION_SECRET must contain at least 32 random bytes encoded as hex');
  const secure = env.NODE_ENV !== 'development';
  const origins = (env.ALLOWED_ORIGINS ?? (secure ? '' : 'http://localhost:5173')).split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length || origins.some(origin => {
    try { const url = new URL(origin); return url.origin !== origin || (secure ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol)); }
    catch { return true; }
  })) throw new Error('ALLOWED_ORIGINS must list exact trusted frontend origins (HTTPS in production)');
  const days = Number(env.SESSION_TTL_DAYS ?? 7);
  if (!Number.isFinite(days) || days < 1 || days > 30) throw new Error('SESSION_TTL_DAYS must be between 1 and 30');
  let trustProxy: AuthConfig['trustProxy'] = false;
  if (env.TRUST_PROXY) {
    if (/^[1-9][0-9]?$/.test(env.TRUST_PROXY)) trustProxy = Number(env.TRUST_PROXY);
    else if (['true', 'false', '0'].includes(env.TRUST_PROXY)) throw new Error('TRUST_PROXY must be a verified hop count or trusted proxy IP/CIDR list');
    else trustProxy = env.TRUST_PROXY.split(',').map(s => s.trim());
  }
  if (secure && !env.DATA_DIR && !env.SESSION_DIR) throw new Error('Set SESSION_DIR or DATA_DIR to a persistent volume');
  if (env.LEGACY_AUTH_ENABLED && !['true', 'false'].includes(env.LEGACY_AUTH_ENABLED)) throw new Error('LEGACY_AUTH_ENABLED must be true or false');
  const legacyEnabled = env.LEGACY_AUTH_ENABLED === 'true';
  const legacyExpiresAt = Date.parse(env.LEGACY_AUTH_EXPIRES_AT ?? '');
  if (legacyEnabled && (!env.APP_TOKEN || !Number.isFinite(legacyExpiresAt) || legacyExpiresAt > Date.now() + 7 * 86400000)) {
    throw new Error('Legacy migration requires APP_TOKEN and LEGACY_AUTH_EXPIRES_AT no more than 7 days ahead');
  }
  return {
    passwordHash, sessionSecret, origins, secure, trustProxy,
    sessionDir: env.SESSION_DIR ?? path.join(env.DATA_DIR ?? path.join(__dirname, '../../data'), 'sessions'),
    sessionTtlMs: days * 86400000,
    legacyToken: legacyEnabled ? env.APP_TOKEN : undefined,
    legacyExpiresAt: legacyEnabled ? legacyExpiresAt : 0,
  };
}
