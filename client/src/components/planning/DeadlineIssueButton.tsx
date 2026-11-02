import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDayMonth, type DeadlineIssue } from '../../utils/planning';

const WIDTH = 240;

/**
 * Small row icon when a linked task's deadline doesn't match its bars. Fixing
 * is always the user's choice and only moves/adds the bar (never the deadline).
 */
export function DeadlineIssueButton({ issue, onFix }: { issue: DeadlineIssue; onFix: () => void }) {
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const outside = issue.kind === 'outside';
  const message = outside
    ? `Task deadline ${formatDayMonth(issue.deadline)} is outside the bar`
    : `Task deadline ${formatDayMonth(issue.deadline)} has no bar`;

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(null); return; }
    const r = button.current!.getBoundingClientRect();
    setOpen({ left: Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8)), top: Math.min(r.bottom + 4, window.innerHeight - 110) });
  };

  return (
    <>
      <button ref={button} type="button" onClick={toggle} title={message} aria-label={message} aria-expanded={!!open}
        className={`p-1 rounded flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
          ${outside ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-400/10' : 'text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
        {outside ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm7-9v6m-3-3h6" />
          </svg>
        )}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50" onPointerDown={() => setOpen(null)}>
          <div role="dialog" aria-label={message} onPointerDown={e => e.stopPropagation()}
            className="absolute rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-3 text-sm"
            style={{ left: open.left, top: open.top, width: WIDTH }}>
            <p className="text-gray-700 dark:text-gray-200">{message}.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {outside ? 'Moves the last bar, keeping its length. The deadline stays as it is.' : 'Adds a one-week bar. The deadline stays as it is.'}
            </p>
            <button onClick={() => { onFix(); setOpen(null); }}
              className="mt-2 px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 cursor-pointer">
              {outside ? 'Align bar' : 'Add bar on deadline week'}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
