import { useEffect, useRef, useState } from 'react';

interface InlineTextProps {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  required?: boolean;      // an empty commit is discarded
  disabled?: boolean;
  listId?: string;         // <datalist> id for autocomplete
  maxLength?: number;
  className?: string;      // display styling
  inputClassName?: string;
  /**
   * 'click' (default): a click edits.
   * 'name': a click toggles expanded/truncated; double-click or the pencil
   * (shown on row hover, or always once expanded) edits.
   */
  mode?: 'click' | 'name';
  expanded?: boolean;
  onToggleExpand?: () => void;
}

/** Delay before a single click counts, so a double-click doesn't toggle twice. */
const CLICK_DELAY_MS = 200;

/** Enter or blur saves, Escape cancels. */
export function InlineText({
  value, onCommit, ariaLabel, placeholder = '', required = false, disabled = false,
  listId, maxLength = 200, className = '', inputClassName = '',
  mode = 'click', expanded = false, onToggleExpand,
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [truncated, setTruncated] = useState(false);
  // Enter unmounts the input, which can fire blur too: commit only once.
  const settled = useRef(false);
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const start = () => {
    if (disabled) return;
    window.clearTimeout(clickTimer.current);
    settled.current = false;
    setDraft(value);
    setEditing(true);
  };
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const next = draft.trim();
    if (save && next !== value && (next || !required)) onCommit(next);
  };

  if (editing) {
    return (
      <input
        autoFocus value={draft} maxLength={maxLength} list={listId} aria-label={ariaLabel} placeholder={placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        }}
        className={`min-w-0 w-full border rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${inputClassName}`}
      />
    );
  }

  if (mode === 'click') {
    return (
      <button
        type="button" onClick={start} disabled={disabled} aria-label={`${ariaLabel}: ${value || 'empty'}. Click to edit`}
        title={disabled ? undefined : 'Click to edit'}
        className={`min-w-0 max-w-full truncate text-left rounded px-1.5 py-0.5 ${disabled ? '' : 'cursor-text hover:bg-gray-100 dark:hover:bg-white/[0.06]'} ${className}`}
      >
        {value || <span className="text-gray-300 dark:text-zinc-600">{placeholder}</span>}
      </button>
    );
  }

  return (
    <span className="flex items-start min-w-0 max-w-full gap-0.5">
      <button
        type="button" aria-expanded={expanded}
        aria-label={`${ariaLabel}: ${value || 'empty'}. Click to ${expanded ? 'shorten' : 'show the full name'}${disabled ? '' : ', double-click to edit'}`}
        // The full name as a tooltip, only when it is actually cut off.
        title={!expanded && truncated ? value : undefined}
        onMouseEnter={e => setTruncated(e.currentTarget.scrollWidth > e.currentTarget.clientWidth)}
        onClick={() => {
          window.clearTimeout(clickTimer.current);
          clickTimer.current = window.setTimeout(() => onToggleExpand?.(), CLICK_DELAY_MS);
        }}
        onDoubleClick={start}
        className={`min-w-0 text-left rounded px-1.5 py-0.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.06]
          ${expanded ? 'whitespace-normal break-words' : 'truncate'} ${className}`}
      >
        {value || <span className="text-gray-300 dark:text-zinc-600">{placeholder}</span>}
      </button>
      {!disabled && (
        <button type="button" onClick={start} aria-label={`Edit ${ariaLabel.toLowerCase()}`} title="Edit (or double-click the name)"
          className={`p-1 rounded flex-shrink-0 text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:hover:text-teal-400 dark:hover:bg-white/[0.06] cursor-pointer
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:opacity-100
            ${expanded ? 'inline-flex md:opacity-0 md:group-hover:opacity-100' : 'hidden md:inline-flex md:opacity-0 md:group-hover:opacity-100'}`}>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2.5 2.5 0 113.536 3.536L12.536 16.536 9 17l.464-3.536z" />
          </svg>
        </button>
      )}
    </span>
  );
}
