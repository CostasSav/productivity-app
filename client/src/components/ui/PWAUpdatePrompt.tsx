import { useRegisterSW } from 'virtual:pwa-register/react';

export function PWAUpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // iOS may suspend the app for days. Check on resume as well as launch.
      const check = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          if (registration.waiting) setNeedRefresh(true);
          registration.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
    },
    onRegisterError(error) {
      console.error('PWA registration failed:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div role="status" className="pwa-update fixed bottom-4 left-4 right-4 sm:left-auto sm:max-w-sm z-[110] rounded-lg border border-teal-200 bg-white p-4 shadow-lg text-sm text-gray-900">
      <p>A new version is ready. Save your changes before reloading.</p>
      <div className="flex gap-3 mt-3">
        <button className="rounded bg-teal-600 px-3 py-2 text-white" onClick={() => { void updateServiceWorker(true); }}>Reload</button>
        <button className="rounded px-3 py-2" onClick={() => setNeedRefresh(false)}>Later</button>
      </div>
    </div>
  );
}
