import { useEffect, useRef } from 'react';

const TOAST_MS = 3000;
const TOAST_ACTION_MS = 6000;

export interface ToastAction { label: string; run: () => void }

/** Same pill style as the Sleep page toast; an action (Undo) keeps it up a little longer. */
export function PlanningToast({ message, action, tone = 'neutral', onDone }: {
  message: string;
  action?: ToastAction;
  tone?: 'neutral' | 'error';
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), action ? TOAST_ACTION_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [action]);
  return (
    <div role={tone === 'error' ? 'alert' : 'status'}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 text-white text-sm pl-4 pr-2 py-2 rounded-full shadow-lg z-50 animate-fade-in max-w-[calc(100vw-2rem)]
        ${tone === 'error' ? 'bg-red-600' : 'bg-gray-900 dark:bg-zinc-700'}`}>
      <span className={action ? 'min-w-0' : 'pr-2 text-center'}>{message}</span>
      {action && (
        <button onClick={() => { action.run(); done.current(); }}
          className="flex-shrink-0 px-3 py-1 rounded-full text-sm font-semibold text-teal-300 hover:bg-white/10 cursor-pointer">
          {action.label}
        </button>
      )}
    </div>
  );
}
