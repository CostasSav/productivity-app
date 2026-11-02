import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatPlanningDate, weekEnd } from '../../utils/planning';
import type { PlanningLegendEntry, PlanningSegment } from '../../types';

interface SegmentMenuProps {
  segment: PlanningSegment;
  legend: PlanningLegendEntry[];
  x: number;
  y: number;
  onColor: (color: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

const WIDTH = 208;

/** Right-click / tap menu for one segment. A full-screen backdrop catches the
 * dismissing click so it can never start a new bar underneath. */
export function SegmentMenu({ segment, legend, x, y, onColor, onDelete, onClose }: SegmentMenuProps) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const height = 92 + legend.length * 32;
  const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));

  return createPortal(
    <div className="fixed inset-0 z-50" onPointerDown={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }}>
      <div role="menu" aria-label="Segment options" onPointerDown={e => e.stopPropagation()}
        className="absolute rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl py-1 text-sm"
        style={{ left, top, width: WIDTH }}>
        <p className="px-3 pt-1 pb-1.5 text-xs text-gray-400 dark:text-gray-500">
          {formatPlanningDate(segment.start)} – {formatPlanningDate(weekEnd(segment.end))}
        </p>
        {legend.map((entry, i) => (
          <button key={i} role="menuitemradio" aria-checked={entry.color === segment.color}
            onClick={() => { onColor(entry.color); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] cursor-pointer">
            <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="flex-1 truncate">{entry.label || 'Untitled'}</span>
            {entry.color === segment.color && <span aria-hidden className="text-teal-600 dark:text-teal-400">✓</span>}
          </button>
        ))}
        <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
        <button role="menuitem" onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete segment
        </button>
      </div>
    </div>,
    document.body,
  );
}
