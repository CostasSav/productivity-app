import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { browserAuth, clearSession, onSessionLost } from '../api/request';

const AuthContext = createContext<{ logout: () => Promise<void> } | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'checking' | 'signed-in' | 'signed-out'>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const channel = useRef<BroadcastChannel>();
  const signingOut = useRef(false);
  const signingIn = useRef(false);
  const clearPrivateData = useCallback(() => {
    void queryClient.cancelQueries();
    queryClient.clear();
    // Keep the selected view, but remove persisted personal timer/task details.
    try {
      sessionStorage.removeItem('app_focus_task');
      sessionStorage.removeItem('app_selected_note');
      localStorage.removeItem('pomodoro_state');
    } catch { /* Storage can be unavailable in private browsing. */ }
    setStatus('signed-out');
    setPassword('');
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    const unsubscribe = onSessionLost(clearPrivateData);
    const check = () => {
      if (document.visibilityState === 'hidden' || signingOut.current || signingIn.current) return;
      void browserAuth.session().then(info => {
        if (!active || signingOut.current || signingIn.current) return;
        if (info.authenticated) setStatus('signed-in');
        else clearSession();
      }).catch(() => {
        if (active && !signingOut.current && !signingIn.current) {
          clearSession();
          setError('Unable to connect. Check your connection and try again.');
        }
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('workspace-auth');
      channel.current.onmessage = event => { if (event.data === 'logout') clearSession(); };
    }
    return () => { active = false; unsubscribe(); document.removeEventListener('visibilitychange', check); channel.current?.close(); };
  }, [clearPrivateData]);

  async function login(event: FormEvent) {
    event.preventDefault();
    signingIn.current = true;
    setBusy(true); setError('');
    const entered = password;
    setPassword('');
    try {
      await browserAuth.login(entered);
      signingOut.current = false;
      queryClient.clear();
      setStatus('signed-in');
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to sign in'); }
    finally { signingIn.current = false; setBusy(false); }
  }
  async function logout() {
    // Hide personal data immediately, including when the network is unavailable.
    signingOut.current = true;
    setStatus('checking');
    try {
      await browserAuth.logout();
      channel.current?.postMessage('logout');
      setError('');
    } catch {
      setError('Could not finish signing out on the server. Reconnect and use “Retry sign out” before leaving this device.');
    } finally { clearSession(); }
  }

  if (status === 'signed-in') return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
  return <main className="min-h-screen min-h-[100dvh] bg-gray-50 dark:bg-zinc-950 flex items-center justify-center" style={{ paddingTop: 'max(24px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', paddingLeft: 'max(24px, env(safe-area-inset-left))', paddingRight: 'max(24px, env(safe-area-inset-right))' }}>
    <section className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 p-7 shadow-sm">
      <div className="text-teal-600 dark:text-teal-400 text-sm font-semibold mb-2">My Workspace</div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-zinc-100">{status === 'checking' ? 'Opening your workspace…' : 'Welcome back'}</h1>
      {status !== 'checking' && <form onSubmit={login} className="mt-6 space-y-4">
        <label className="block text-sm text-gray-700 dark:text-zinc-300">Password
          <input type="password" name="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}
            className="mt-2 w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-transparent p-3 text-base focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </label>
        <button disabled={busy} className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium p-3 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>}
      {error && <div role="alert" className="mt-4 text-sm text-red-700 dark:text-red-400">{error}</div>}
      {error.startsWith('Could not finish') && <button onClick={() => void logout()} className="mt-3 text-sm text-teal-600 underline">Retry sign out</button>}
    </section>
  </main>;
}
