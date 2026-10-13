export interface WidgetConfig { digest: string; expiresAt: number; timeZone: string }

// Invalid or missing configuration disables only widget access.
export function readWidgetConfig(env: NodeJS.ProcessEnv = process.env): WidgetConfig | null {
  const digest = env.WIDGET_READ_TOKEN_SHA256 ?? '';
  const expiration = env.WIDGET_READ_TOKEN_EXPIRES_AT ?? '';
  const timeZone = env.WIDGET_TIME_ZONE ?? 'Europe/Paris';
  if (!/^[a-fA-F0-9]{64}$/.test(digest) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiration)) return null;
  const expiresAt = Date.parse(expiration);
  if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== expiration.replace(/Z$/, expiration.includes('.') ? 'Z' : '.000Z')) return null;
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); } catch { return null; }
  return { digest: digest.toLowerCase(), expiresAt, timeZone };
}
