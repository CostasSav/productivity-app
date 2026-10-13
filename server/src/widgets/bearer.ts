import { createHash, timingSafeEqual } from 'crypto';
import type { WidgetConfig } from './config';

export function validBearer(header: string | undefined, config: WidgetConfig | null | undefined, now: Date): boolean {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header ?? '');
  const digest = createHash('sha256').update(match?.[1] ?? '').digest();
  const expected = Buffer.from(config?.digest ?? '00'.repeat(32), 'hex');
  const equal = expected.length === digest.length && timingSafeEqual(digest, expected);
  return !!match && !!config && equal && now.getTime() < config.expiresAt;
}
