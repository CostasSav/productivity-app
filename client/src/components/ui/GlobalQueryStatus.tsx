import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export function GlobalFetchingBar() {
  const isFetching = useIsFetching();
  if (isFetching === 0) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 h-0.5 z-[100] bg-teal-500 animate-pulse"
      aria-hidden
    />
  );
}

export function GlobalQueryErrorBanner() {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.query.state.status === 'error') {
        const err = event.query.state.error as Error;
        setErrorMsg(err?.message ?? 'Something went wrong');
      }
    });
  }, [queryClient]);

  if (!errorMsg) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-[90] flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg shadow-md max-w-sm"
    >
      <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-sm text-red-700 dark:text-red-300 flex-1 leading-snug">{errorMsg}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => {
            setErrorMsg(null);
            queryClient.invalidateQueries();
          }}
          className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors cursor-pointer"
        >
          Retry
        </button>
        <button
          onClick={() => setErrorMsg(null)}
          aria-label="Dismiss error"
          className="text-red-400 hover:text-red-600 dark:hover:text-red-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
