import { useState, useEffect, useCallback, useMemo, useRef, forwardRef } from 'react';
import { api } from '../api';
import { GROCERY_CATEGORIES } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  'Produce':       '#86efac',
  'Meat & Fish':   '#fca5a5',
  'Dairy & Eggs':  '#fde68a',
  'Bakery':        '#fed7aa',
  'Frozen':        '#bae6fd',
  'Pantry':        '#c4b5fd',
  'Drinks':        '#6ee7b7',
  'Snacks':        '#fbcfe8',
  'Cleaning':      '#cbd5e1',
  'Personal Care': '#f0abfc',
  'Other':         '#a1a1aa',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function groupByCategory(items) {
  const map = {};
  GROCERY_CATEGORIES.forEach(cat => { map[cat] = []; });
  items.forEach(item => {
    (map[item.category] ?? (map['Other'] = map['Other'] || [])).push(item);
  });
  return GROCERY_CATEGORIES
    .filter(cat => (map[cat] ?? []).length > 0)
    .map(cat => ({ category: cat, items: map[cat] }));
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const ai = GROCERY_CATEGORIES.indexOf(a.category);
    const bi = GROCERY_CATEGORIES.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

function qtyLabel(quantity, unit) {
  if (quantity === 1 && !unit) return '';
  return unit ? `${quantity} ${unit}` : String(quantity);
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconX({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconTrash({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function IconStar({ filled, className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}

function IconPlus({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function IconGrip({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path d="M7 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM7 8a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm-6 6a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" />
    </svg>
  );
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onUndo, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-gray-900 dark:bg-zinc-700 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl animate-fade-in ${onUndo ? '' : 'pointer-events-none'}`}>
      <span>{message}</span>
      {onUndo && (
        <button
          onClick={onUndo}
          className="font-semibold text-teal-400 hover:text-teal-300 transition-colors cursor-pointer"
        >
          Undo
        </button>
      )}
    </div>
  );
}

// ── Edit popover ──────────────────────────────────────────────────────────────

function EditPopover({ item, onSave, onClose }) {
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [category, setCategory] = useState(item.category);
  const [note, setNote] = useState(item.note || '');
  const cardRef = useRef(null);
  const savedRef = useRef(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { onClose(); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const commit = useCallback(() => {
    if (savedRef.current) return;
    savedRef.current = true;
    const trimmed = name.trim();
    if (trimmed) {
      onSave(item.id, { name: trimmed, quantity: parseFloat(qty) || 1, unit: unit.trim(), category, note: note.trim() || null });
    }
    onClose();
  }, [name, qty, unit, category, note, item.id, onSave, onClose]);

  const handleBackdrop = (e) => {
    if (!cardRef.current?.contains(e.target)) commit();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
  };

  const inputCls = 'w-full bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center" onMouseDown={handleBackdrop}>
      <div ref={cardRef} className="w-80 bg-white dark:bg-[#1c1c1f] border border-gray-200 dark:border-zinc-700 rounded-2xl shadow-2xl p-5 space-y-3">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Item name"
          className={inputCls}
        />

        <div className="flex gap-2">
          <input
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={handleKey}
            min="0.1"
            step="0.1"
            className="w-20 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-2 text-sm text-gray-800 dark:text-gray-100 text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            value={unit}
            onChange={e => setUnit(e.target.value)}
            onKeyDown={handleKey}
            placeholder="unit"
            className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          onKeyDown={handleKey}
          className={inputCls}
        >
          {GROCERY_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Note (optional)"
          rows={2}
          className={`${inputCls} resize-none`}
        />

        <div className="flex justify-end gap-2 pt-1">
          <button
            onMouseDown={e => { e.stopPropagation(); onClose(); }}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onMouseDown={e => { e.stopPropagation(); commit(); }}
            className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAddItem, onAddStaples }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6">
      <svg className="w-28 h-28 text-gray-200 dark:text-zinc-800" fill="none" stroke="currentColor" viewBox="0 0 80 80" strokeWidth={1.5}>
        <rect x="10" y="30" width="60" height="38" rx="6" strokeLinecap="round" />
        <path strokeLinecap="round" d="M24 30c0-8.837 7.163-16 16-16s16 7.163 16 16" />
        <circle cx="29" cy="72" r="4" fill="currentColor" stroke="none" />
        <circle cx="51" cy="72" r="4" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M32 46h16M40 38v16" strokeWidth={2} opacity={0.5} />
      </svg>

      <div className="text-center">
        <p className="text-base font-semibold text-gray-700 dark:text-zinc-200">Your list is empty</p>
        <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">Ready for a new week?</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onAddItem}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <IconPlus className="w-3.5 h-3.5" />
          Add item
        </button>
        <button
          onClick={onAddStaples}
          className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 text-sm font-medium rounded-lg hover:border-amber-300 hover:text-amber-600 dark:hover:border-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer"
        >
          <IconStar filled={false} className="w-3.5 h-3.5" />
          Add staples
        </button>
      </div>
    </div>
  );
}

// ── Shopping item row (tap-only, no actions) ──────────────────────────────────

function ShoppingItemRow({ item, onToggle }) {
  const done = item.checked;
  const qty = qtyLabel(item.quantity, item.unit);

  return (
    <button
      onClick={() => onToggle(item.id, !done)}
      className="w-full flex items-center gap-4 px-5 min-h-[56px] py-4 active:bg-gray-100 dark:active:bg-zinc-800/60 transition-colors text-left cursor-pointer"
    >
      <div className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
        done ? 'bg-teal-500 border-teal-500' : 'border-gray-300 dark:border-zinc-600'
      }`}>
        {done && (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={`flex-1 text-base leading-snug ${done ? 'line-through text-gray-400 dark:text-zinc-500' : 'text-gray-900 dark:text-gray-100 font-medium'}`}>
        {item.name}
      </span>
      {qty && (
        <span className="text-sm text-gray-400 dark:text-zinc-500 font-mono flex-shrink-0">{qty}</span>
      )}
    </button>
  );
}

// ── Shopping mode overlay ─────────────────────────────────────────────────────

function ShoppingMode({ items, onToggle, onExit, onClearAndExit }) {
  const [doneSectionOpen, setDoneSectionOpen] = useState(false);

  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const total = items.length;
  const checkedCount = checked.length;
  const allDone = total > 0 && checkedCount === total;
  const progressPct = total > 0 ? (checkedCount / total) * 100 : 0;

  const uncheckedGrouped = useMemo(() => groupByCategory(unchecked), [unchecked]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-[#111113] flex flex-col">

      {/* Progress header */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <span className="text-sm font-medium text-gray-500 dark:text-zinc-400">
            {allDone ? 'All done!' : `${checkedCount} of ${total} item${total !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={onExit}
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
          >
            Exit
          </button>
        </div>
        <div className="h-1 w-full bg-gray-200 dark:bg-zinc-800">
          <div
            className={`h-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-teal-500'}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {allDone ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
          <div className="text-center">
            <p className="text-5xl mb-4">🛒</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">All done!</p>
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-2">You got everything on the list.</p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={onClearAndExit}
              className="w-full py-4 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-base font-semibold rounded-2xl transition-colors cursor-pointer"
            >
              Clear checked & exit
            </button>
            <button
              onClick={onExit}
              className="w-full py-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-200 text-base font-medium rounded-2xl hover:bg-gray-50 dark:hover:bg-zinc-800 active:bg-gray-100 dark:active:bg-zinc-700 transition-colors cursor-pointer"
            >
              Just exit
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {total === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-zinc-500 py-20">No items on your list.</p>
          ) : (
            <>
              {uncheckedGrouped.map(({ category, items: catItems }) => (
                <div key={category}>
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 dark:bg-[#111113] sticky top-0 z-10">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[category] ?? '#a1a1aa' }} />
                    <span className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{category}</span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-zinc-800/40">
                    {catItems.map(item => (
                      <ShoppingItemRow key={item.id} item={item} onToggle={onToggle} />
                    ))}
                  </div>
                </div>
              ))}

              {checked.length > 0 && (
                <div className="mt-4 border-t border-gray-100 dark:border-zinc-800/60">
                  <button
                    onClick={() => setDoneSectionOpen(o => !o)}
                    className="flex items-center gap-2.5 w-full px-5 py-4 text-sm font-medium text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${doneSectionOpen ? '' : '-rotate-90'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    Done ({checked.length})
                  </button>
                  {doneSectionOpen && (
                    <div className="divide-y divide-gray-100 dark:divide-zinc-800/40">
                      {checked.map(item => (
                        <ShoppingItemRow key={item.id} item={item} onToggle={onToggle} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

function GroceryItemRow({
  item, isStaple, onToggle, onDelete, onStapleToggle, onEdit,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver,
}) {
  const done = item.checked;
  const qty = qtyLabel(item.quantity, item.unit);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id, item.category)}
      onDragOver={e => { e.preventDefault(); onDragOver(item.id, item.category); }}
      onDrop={e => { e.preventDefault(); onDrop(item.id); }}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-2 px-3 py-2.5 transition-all duration-150
        ${isDragOver ? 'border-t-2 border-teal-400 dark:border-teal-500' : ''}
        ${isDragging ? 'opacity-30' : done ? 'opacity-40' : ''}`}
    >
      {/* Drag handle */}
      <div className="flex-shrink-0 cursor-grab text-gray-200 dark:text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder">
        <IconGrip />
      </div>

      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id, !done)}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
          done ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300 dark:border-zinc-600 hover:border-teal-400'
        }`}
      >
        {done && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Name — clickable to edit */}
      <button
        onClick={() => onEdit(item)}
        className={`flex-1 text-sm leading-snug text-left cursor-pointer transition-colors ${
          done
            ? 'line-through text-gray-400 dark:text-zinc-500'
            : 'text-gray-800 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400'
        }`}
      >
        {item.name}
        {item.note && (
          <span className="ml-1.5 text-xs text-gray-400 dark:text-zinc-600 font-normal not-italic">{item.note}</span>
        )}
      </button>

      {qty && (
        <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono flex-shrink-0">{qty}</span>
      )}

      <button
        onClick={() => onStapleToggle(item)}
        title={isStaple ? 'Remove from staples' : 'Save as staple'}
        className={`flex-shrink-0 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 ${
          isStaple ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 dark:text-zinc-600 hover:text-amber-400'
        }`}
      >
        <IconStar filled={isStaple} />
      </button>

      <button
        onClick={() => onDelete(item.id)}
        className="flex-shrink-0 text-gray-200 dark:text-zinc-700 hover:text-red-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
      >
        <IconTrash />
      </button>
    </div>
  );
}

// ── Staple row ────────────────────────────────────────────────────────────────

function StapleRow({ staple, onDelete }) {
  const qty = qtyLabel(staple.quantity, staple.unit);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{staple.name}</span>
      {qty && (
        <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono flex-shrink-0">{qty}</span>
      )}
      <button
        onClick={() => onDelete(staple.id)}
        className="flex-shrink-0 text-gray-200 dark:text-zinc-700 hover:text-red-400 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
      >
        <IconTrash />
      </button>
    </div>
  );
}

// ── Add form (shared) ─────────────────────────────────────────────────────────

const AddForm = forwardRef(function AddForm({ onSubmit, loading, placeholder = 'Item name', submitLabel = 'Add' }, ref) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), quantity: parseFloat(qty) || 1, unit: unit.trim() });
    setName('');
    setQty('1');
    setUnit('');
    if (ref && typeof ref === 'object' && ref.current) ref.current.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        ref={ref}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <input
        type="number"
        value={qty}
        onChange={e => setQty(e.target.value)}
        min="0.1"
        step="0.1"
        className="w-14 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-2 py-2 text-sm text-gray-800 dark:text-gray-100 text-center focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <input
        value={unit}
        onChange={e => setUnit(e.target.value)}
        placeholder="unit"
        className="w-14 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-2 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
      <button
        type="submit"
        disabled={!name.trim() || loading}
        className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
      >
        {loading ? '...' : submitLabel}
      </button>
    </form>
  );
});

// ── Staples panel ─────────────────────────────────────────────────────────────

function StaplesPanel({ open, onClose, staples, items, onAddStaple, onDeleteStaple, onAddAllToList, addingStaple }) {
  const grouped = useMemo(() => groupByCategory(staples), [staples]);
  const existingNames = useMemo(() => new Set(items.map(i => i.name.toLowerCase())), [items]);
  const newCount = staples.filter(s => !existingNames.has(s.name.toLowerCase())).length;
  const skipCount = staples.length - newCount;

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />}

      <div className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-[#09090b] border-l border-gray-200 dark:border-zinc-800/60 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-start justify-between px-4 pt-5 pb-4 border-b border-gray-100 dark:border-zinc-800/60">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Staples</h2>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              {staples.length === 0 ? 'Items you buy regularly' : `${staples.length} item${staples.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
            <IconX />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800/60">
          <button
            onClick={onAddAllToList}
            disabled={staples.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <IconPlus />
            Add all to list
          </button>
          {staples.length > 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-zinc-500 mt-1.5">
              {newCount > 0 ? `${newCount} new` : 'All already on list'}
              {skipCount > 0 && newCount > 0 ? ` · ${skipCount} already on list` : ''}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {staples.length === 0 ? (
            <p className="text-center text-xs text-gray-400 dark:text-zinc-500 py-10 px-4">
              Add items you buy every week or two — you can add them all to your list in one tap.
            </p>
          ) : (
            grouped.map(({ category, items: catStaples }) => (
              <div key={category} className="mb-1">
                <div className="flex items-center gap-1.5 px-4 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[category] ?? '#a1a1aa' }} />
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{category}</span>
                </div>
                {catStaples.map(s => <StapleRow key={s.id} staple={s} onDelete={onDeleteStaple} />)}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-zinc-800/60 px-4 py-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Add staple</p>
          <AddForm onSubmit={onAddStaple} loading={addingStaple} placeholder="e.g. Milk" submitLabel="Add" />
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Grocery() {
  const [items, setItems] = useState([]);
  const [staples, setStaples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showStaples, setShowStaples] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [addingItem, setAddingItem] = useState(false);
  const [addingStaple, setAddingStaple] = useState(false);

  // Drag state
  const [dragId, setDragId] = useState(null);
  const [dragCategory, setDragCategory] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Ref for focusing the add bar from empty state
  const addBarRef = useRef(null);
  const clearCheckedTimerRef = useRef(null);

  const showToast = useCallback((msg, onUndo) => {
    setToast(null);
    requestAnimationFrame(() => setToast({ message: msg, onUndo }));
  }, []);

  const loadAll = useCallback(async () => {
    const [itemList, stapleList] = await Promise.all([
      api.grocery.list(),
      api.groceryStaples.list(),
    ]);
    setItems(sortItems(itemList));
    setStaples(stapleList);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const stapleByName = useMemo(() => {
    const m = new Map();
    staples.forEach(s => m.set(s.name.toLowerCase(), s));
    return m;
  }, [staples]);

  const grouped = useMemo(() => groupByCategory(items), [items]);
  const checkedCount = items.filter(i => i.checked).length;

  // ── Item handlers ──────────────────────────────────────

  const handleToggle = useCallback(async (id, checked) => {
    const updated = await api.grocery.update(id, { checked });
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  }, []);

  const handleDeleteItem = useCallback(async (id) => {
    await api.grocery.delete(id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleClearChecked = useCallback(() => {
    const removed = items.filter(i => i.checked);
    if (!removed.length) return;

    setItems(prev => prev.filter(i => !i.checked));

    if (clearCheckedTimerRef.current) clearTimeout(clearCheckedTimerRef.current);
    clearCheckedTimerRef.current = setTimeout(() => {
      api.grocery.deleteChecked().catch(() => {});
    }, 5000);

    const undo = () => {
      clearTimeout(clearCheckedTimerRef.current);
      clearCheckedTimerRef.current = null;
      setItems(prev => sortItems([...prev, ...removed]));
      setToast(null);
    };

    showToast(`Removed ${removed.length} item${removed.length !== 1 ? 's' : ''} — `, undo);
  }, [items, showToast]);

  const handleClearAndExit = useCallback(async () => {
    await api.grocery.deleteChecked();
    setItems(prev => prev.filter(i => !i.checked));
    setShopping(false);
  }, []);

  const handleAddItem = useCallback(async ({ name, quantity, unit }) => {
    setAddingItem(true);
    try {
      const item = await api.grocery.add({ name, quantity, unit });
      setItems(prev => sortItems([...prev, item]));
    } finally {
      setAddingItem(false);
    }
  }, []);

  const handleUpdateItem = useCallback(async (id, fields) => {
    const updated = await api.grocery.update(id, fields);
    setItems(prev => sortItems(prev.map(i => i.id === id ? updated : i)));
  }, []);

  // ── Drag handlers ──────────────────────────────────────

  const handleDragStart = useCallback((id, category) => {
    setDragId(id);
    setDragCategory(category);
  }, []);

  const handleDragOver = useCallback((id, category) => {
    if (category !== dragCategory) return;
    if (id !== dragId) setDragOverId(id);
  }, [dragId, dragCategory]);

  const handleDrop = useCallback((targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const catItems = items.filter(i => i.category === dragCategory);
    const ids = catItems.map(i => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    const orderMap = new Map(reordered.map((id, idx) => [id, idx]));
    setItems(prev => sortItems(prev.map(i => orderMap.has(i.id) ? { ...i, order: orderMap.get(i.id) } : i)));
    api.grocery.reorder(reordered).catch(() => {});
    setDragId(null);
    setDragOverId(null);
    setDragCategory(null);
  }, [dragId, dragCategory, items]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
    setDragCategory(null);
  }, []);

  // ── Staple toggle on item rows ─────────────────────────

  const handleStapleToggle = useCallback(async (item) => {
    const existing = stapleByName.get(item.name.toLowerCase());
    if (existing) {
      await api.groceryStaples.delete(existing.id);
      setStaples(prev => prev.filter(s => s.id !== existing.id));
    } else {
      const staple = await api.groceryStaples.add({ name: item.name, quantity: item.quantity, unit: item.unit });
      setStaples(prev => [...prev, staple]);
    }
  }, [stapleByName]);

  // ── Staple panel handlers ──────────────────────────────

  const handleAddStaple = useCallback(async ({ name, quantity, unit }) => {
    setAddingStaple(true);
    try {
      const staple = await api.groceryStaples.add({ name, quantity, unit });
      setStaples(prev => [...prev, staple]);
    } finally {
      setAddingStaple(false);
    }
  }, []);

  const handleDeleteStaple = useCallback(async (id) => {
    await api.groceryStaples.delete(id);
    setStaples(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleAddAllToList = useCallback(async () => {
    const { added, skipped } = await api.groceryStaples.addToList();
    const fresh = await api.grocery.list();
    setItems(sortItems(fresh));
    const parts = [];
    if (added > 0) parts.push(`${added} staple${added !== 1 ? 's' : ''} added`);
    if (skipped > 0) parts.push(`${skipped} already on list`);
    showToast(parts.join(' · ') || 'Nothing to add');
  }, [showToast]);

  // ── Render ─────────────────────────────────────────────

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner /></div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">

      {/* Scrollable list area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Grocery</h1>
            <div className="flex items-center gap-2">
              {checkedCount > 0 && (
                <button
                  onClick={handleClearChecked}
                  className="text-xs text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Clear {checkedCount} checked
                </button>
              )}
              <button
                onClick={() => setShopping(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-500/20 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Shop
              </button>
              <button
                onClick={() => setShowStaples(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-zinc-300 bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-lg hover:border-amber-300 hover:text-amber-600 dark:hover:border-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer"
              >
                <IconStar filled={false} className="w-3.5 h-3.5" />
                Staples
                {staples.length > 0 && <span className="text-xs text-gray-400 dark:text-zinc-600">{staples.length}</span>}
              </button>
            </div>
          </div>

          {/* Item list or empty state */}
          {items.length === 0 ? (
            <EmptyState
              onAddItem={() => addBarRef.current?.focus()}
              onAddStaples={() => setShowStaples(true)}
            />
          ) : (
            <div className="space-y-3 mb-6">
              {grouped.map(({ category, items: catItems }) => (
                <div key={category} className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-zinc-800/40">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[category] ?? '#a1a1aa' }} />
                    <span className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide flex-1">{category}</span>
                    <span className="text-xs text-gray-300 dark:text-zinc-700">
                      {catItems.filter(i => !i.checked).length}/{catItems.length}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-zinc-800/30">
                    {catItems.map(item => (
                      <GroceryItemRow
                        key={item.id}
                        item={item}
                        isStaple={stapleByName.has(item.name.toLowerCase())}
                        onToggle={handleToggle}
                        onDelete={handleDeleteItem}
                        onStapleToggle={handleStapleToggle}
                        onEdit={setEditItem}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        isDragging={dragId === item.id}
                        isDragOver={dragOverId === item.id && dragId !== item.id}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add item bar — sticky bottom */}
      <div className="border-t border-gray-200 dark:border-zinc-800/60 bg-white dark:bg-[#09090b] px-4 py-3 flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <AddForm
            ref={addBarRef}
            onSubmit={handleAddItem}
            loading={addingItem}
            placeholder="Add an item..."
            submitLabel="Add"
          />
        </div>
      </div>

      {/* Staples panel */}
      <StaplesPanel
        open={showStaples}
        onClose={() => setShowStaples(false)}
        staples={staples}
        items={items}
        onAddStaple={handleAddStaple}
        onDeleteStaple={handleDeleteStaple}
        onAddAllToList={handleAddAllToList}
        addingStaple={addingStaple}
      />

      {/* Edit popover */}
      {editItem && (
        <EditPopover
          item={editItem}
          onSave={handleUpdateItem}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast key={toast.message + Date.now()} message={toast.message} onUndo={toast.onUndo} onClose={() => setToast(null)} />}

      {/* Shopping mode */}
      {shopping && (
        <ShoppingMode
          items={items}
          onToggle={handleToggle}
          onExit={() => setShopping(false)}
          onClearAndExit={handleClearAndExit}
        />
      )}
    </div>
  );
}
