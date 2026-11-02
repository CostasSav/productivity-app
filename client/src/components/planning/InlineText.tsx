import { useRef, useState } from 'react';

interface InlineTextProps {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  required?: boolean;      // an empty commit is discarded
  disabled?: boolean;
  listId?: string;         // <datalist> id for autocomplete
  maxLength?: number;
  className?: string;      // display (button) styling
  inputClassName?: string;
}

/** Click to edit; Enter or blur saves, Escape cancels. */
export function InlineText({
  value, onCommit, ariaLabel, placeholder = '', required = false, disabled = false,
  listId, maxLength = 200, className = '', inputClassName = '',
}: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter unmounts the input, which can fire blur too: commit only once.
  const settled = useRef(false);

  const start = () => {
    if (disabled) return;
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
