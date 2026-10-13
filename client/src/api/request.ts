export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export interface SessionInfo { authenticated: boolean; csrfToken: string }
let csrfToken = '';
let authenticated = false;
let generation = 0;
const pending = new Set<AbortController>();
const listeners = new Set<() => void>();

export function onSessionLost(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function clearSession() {
  generation++;
  csrfToken = '';
  authenticated = false;
  pending.forEach(controller => controller.abort());
  pending.clear();
  listeners.forEach(listener => listener());
}

// Same-origin in production (Vercel rewrite) and development (Vite proxy).
// Secrets and session cookies are never accessible to this module.
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const authRequest = url.startsWith('/api/auth/');
  if (!authRequest && !authenticated) throw new ApiError(401, 'Please sign in');
  const started = generation;
  const controller = new AbortController();
  pending.add(controller);
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(options.method ?? 'GET')) headers.set('X-CSRF-Token', csrfToken);
  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
    const body = res.status === 204 ? undefined : await res.json().catch(() => {
      if (res.ok) throw new Error('Unexpected server response. Check the API connection.');
      return {};
    });
    if (started !== generation) throw new DOMException('Session changed', 'AbortError');
    if (!res.ok) {
      if (res.status === 401 && !authRequest) clearSession();
      throw new ApiError(res.status, body?.error ?? `Request failed: ${res.status}`);
    }
    return body as T;
  } finally { pending.delete(controller); }
}

function acceptSession(info: SessionInfo) {
  if (typeof info.authenticated !== 'boolean' || typeof info.csrfToken !== 'string' || !info.csrfToken) {
    throw new Error('Unable to connect to the authentication service.');
  }
  csrfToken = info.csrfToken;
  authenticated = info.authenticated;
  return info;
}
let checking: Promise<SessionInfo> | undefined;
export const browserAuth = {
  session() {
    // Share StrictMode/foreground initialization; never repeat passwords or mutations.
    return checking ??= request<SessionInfo>('/api/auth/session').then(acceptSession).finally(() => { checking = undefined; });
  },
  async login(password: string) {
    // Refresh the short-lived login CSRF session after an idle login screen.
    await browserAuth.session();
    return acceptSession(await request<SessionInfo>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }));
  },
  async logout() {
    await browserAuth.session();
    await request<void>('/api/auth/logout', { method: 'POST' });
    clearSession();
  },
};
