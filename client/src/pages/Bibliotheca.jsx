import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { api } from '../api';

// ── Shared styles ──────────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all';
const LABEL_CLS = 'block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5';

// ── Icons ──────────────────────────────────────────────────────────────────────

function Icon({ d, d2, className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {d2 && <path strokeLinecap="round" strokeLinejoin="round" d={d2} />}
    </svg>
  );
}

function Spinner({ className = 'w-5 h-5' }) {
  return <div className={`${className} border-2 border-teal-500 border-t-transparent rounded-full animate-spin`} />;
}

// ── Star Rating (display) ──────────────────────────────────────────────────────

function StarRating({ rating }) {
  if (rating == null) return null;
  const full = Math.floor(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3 h-3 ${i <= full ? 'text-amber-400' : 'text-gray-200 dark:text-zinc-700'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

// ── Rating Picker (interactive) ────────────────────────────────────────────────

function RatingPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? value ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onChange(value === star ? null : star)}
          className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
        >
          <svg className={`w-7 h-7 transition-colors ${display >= star ? 'text-amber-400' : 'text-gray-200 dark:text-zinc-700'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
      {value != null && (
        <span className="text-sm text-gray-500 dark:text-zinc-400 ml-1">{value} / 5</span>
      )}
    </div>
  );
}

// ── Tag Input ─────────────────────────────────────────────────────────────────

function TagsInput({ tags, onChange }) {
  const [input, setInput] = useState('');

  const flush = (raw) => {
    const newTags = raw.split(',').map(t => t.trim()).filter(t => t && !tags.includes(t));
    if (newTags.length) onChange([...tags, ...newTags]);
    setInput('');
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-zinc-700 rounded-lg min-h-[38px] focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition-all">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-xs font-medium px-2.5 py-1 rounded-full">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))} className="text-teal-400 hover:text-teal-700 dark:hover:text-teal-200 cursor-pointer leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); flush(input); }
          if (e.key === 'Backspace' && !input && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (input.trim()) flush(input); }}
        placeholder={tags.length === 0 ? 'Add tags… (Enter or comma)' : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500"
      />
    </div>
  );
}

// ── Cover Image (from book object with letter fallback) ────────────────────────

const COVER_BG = [
  'bg-indigo-500', 'bg-teal-500', 'bg-rose-500', 'bg-amber-500',
  'bg-violet-500', 'bg-emerald-500', 'bg-sky-500', 'bg-pink-500',
];

function CoverImage({ book, className = 'w-full h-full' }) {
  const [err, setErr] = useState(false);
  if (!book.coverUrl || err) {
    const color = COVER_BG[book.id % COVER_BG.length];
    return (
      <div className={`${className} ${color} flex items-center justify-center`}>
        <span className="text-white font-bold text-2xl select-none">{book.title?.[0]?.toUpperCase() ?? '?'}</span>
      </div>
    );
  }
  return <img src={book.coverUrl} alt={book.title} className={`${className} object-cover`} onError={() => setErr(true)} />;
}

// ── Cover Preview (from URL string, for the modal form) ────────────────────────

function CoverPreview({ url, title }) {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [url]);
  if (!url || err) {
    return (
      <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center rounded-xl">
        <span className="text-2xl font-bold text-gray-300 dark:text-zinc-600 select-none">{title?.[0]?.toUpperCase() || '?'}</span>
      </div>
    );
  }
  return <img src={url} alt="" className="w-full h-full object-cover rounded-xl" onError={() => setErr(true)} />;
}

// ── Reading Card (horizontal) ──────────────────────────────────────────────────

function ReadingCard({ book, onClick }) {
  const pct = book.totalPages && book.totalPages > 0
    ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100))
    : null;
  const pagesLeft = book.totalPages ? Math.max(0, book.totalPages - book.currentPage) : null;

  return (
    <div
      onClick={() => onClick(book)}
      className="flex gap-4 p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06] shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
        <CoverImage book={book} className="w-full h-full" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{book.title}</h3>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">{book.author}</p>
        <div className="mt-auto">
          {pct !== null ? (
            <>
              <div className="flex items-center justify-between text-xs text-gray-400 dark:text-zinc-500 mb-1.5">
                <span>{pagesLeft === 0 ? 'Finished!' : pagesLeft != null ? `${pagesLeft} pages left` : `Page ${book.currentPage}`}</span>
                <span className="font-medium text-teal-600 dark:text-teal-400">{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            book.currentPage > 0 && <p className="text-xs text-gray-400 dark:text-zinc-500">Page {book.currentPage}</p>
          )}
          <button
            onClick={e => { e.stopPropagation(); onClick(book); }}
            className="mt-3 px-3 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Book Card (vertical, for shelves) ─────────────────────────────────────────

function BookCard({ book, position, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, onClick }) {
  const draggable = !!onDragStart;
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? e => { e.stopPropagation(); onDragStart(book.id); } : undefined}
      onDragOver={draggable ? e => { e.preventDefault(); onDragOver(book.id); } : undefined}
      onDrop={draggable ? e => { e.preventDefault(); onDrop(book.id); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onClick(book)}
      className={`relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer group
        bg-white dark:bg-zinc-900/60
        ${isDragging ? 'opacity-30 scale-95' : 'opacity-100 scale-100'}
        ${isDragOver ? 'ring-2 ring-teal-400 dark:ring-teal-500 border-transparent' : 'border-gray-100 dark:border-white/[0.06]'}
        hover:shadow-md shadow-sm`}
    >
      {position === 0 && (
        <div className="absolute top-2 left-2 z-10 bg-teal-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">Up next</div>
      )}
      {position != null && position > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">#{position + 1}</div>
      )}
      {draggable && (
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-70 transition-opacity text-white drop-shadow">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM7 8a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm-6 6a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" />
          </svg>
        </div>
      )}
      <div className="aspect-[2/3] w-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
        <CoverImage book={book} className="w-full h-full" />
      </div>
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <h4 className="text-xs font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{book.title}</h4>
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 truncate">{book.author}</p>
        {book.status === 'finished' && book.rating != null && (
          <div className="mt-auto pt-1"><StarRating rating={book.rating} /></div>
        )}
        {book.status === 'dnf' && (
          <p className="text-[10px] text-gray-300 dark:text-zinc-600 mt-auto pt-1 italic">Did not finish</p>
        )}
      </div>
    </div>
  );
}

// ── Shelf Section (collapsible) ────────────────────────────────────────────────

function ShelfSection({ title, count, collapsed, onToggle, children }) {
  return (
    <div className="mb-6">
      <button onClick={onToggle} className="flex items-center gap-2 w-full py-2 mb-3 text-left group">
        <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{title}</span>
        <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 rounded-full px-2 py-0.5 font-medium">{count}</span>
        <svg className={`w-4 h-4 ml-auto text-gray-400 dark:text-zinc-500 transition-transform duration-200 ${collapsed ? '-rotate-90' : 'rotate-0'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: collapsed ? '0fr' : '1fr', transition: 'grid-template-rows 0.25s ease' }}>
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// ── Goal Progress ──────────────────────────────────────────────────────────────

function GoalProgress({ stats, settings, onUpdateGoal }) {
  const [editing, setEditing] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const inputRef = useRef(null);

  const finished = stats?.finishedThisYear ?? 0;
  const goal = settings?.yearlyGoal ?? 12;
  const pct = goal > 0 ? Math.min(100, Math.round((finished / goal) * 100)) : 0;

  const startEdit = () => { setGoalInput(String(goal)); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const commit = () => { const n = parseInt(goalInput, 10); if (!isNaN(n) && n > 0 && n !== goal) onUpdateGoal(n); setEditing(false); };

  return (
    <div onClick={!editing ? startEdit : undefined} title={editing ? undefined : 'Click to edit yearly goal'}
      className={`flex items-center gap-2.5 mt-1 ${!editing ? 'cursor-pointer group' : ''}`}>
      <span className="text-xs text-gray-500 dark:text-zinc-400 whitespace-nowrap flex-shrink-0">
        {finished} /{' '}
        {editing ? (
          <input ref={inputRef} value={goalInput} onChange={e => setGoalInput(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-8 text-center border-b border-teal-500 bg-transparent text-gray-900 dark:text-white focus:outline-none"
            onClick={e => e.stopPropagation()} />
        ) : (
          <span className="group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{goal}</span>
        )}{' '}books this year
      </span>
      <div className="h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden w-32 flex-shrink-0">
        <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0">{pct}%</span>
    </div>
  );
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  reading: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  finished: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'want-to-read': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  dnf: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400',
};
const STATUS_LABEL = { reading: 'Reading', finished: 'Finished', 'want-to-read': 'Want to Read', dnf: 'Did not finish' };

// ── Markdown note editor (shared) ─────────────────────────────────────────────

function NoteEditor({ value, onChange, onSave, saving, rows = 5 }) {
  const [mode, setMode] = useState('edit');
  return (
    <div>
      <div className="flex items-center gap-1 px-1 mb-1.5">
        <button onClick={() => setMode('edit')}
          className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${mode === 'edit' ? 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200'}`}>
          Edit
        </button>
        <button onClick={() => setMode('preview')}
          className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer transition-colors ${mode === 'preview' ? 'bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-200'}`}>
          Preview
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSave) onSave(); }}
          placeholder="Write your note here… (Markdown supported)"
          rows={rows}
          className="w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-lg outline-none resize-none font-mono leading-relaxed focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
        />
      ) : (
        <div className="min-h-[80px] px-3 py-2.5 bg-gray-50 dark:bg-zinc-800/40 border border-gray-200 dark:border-zinc-700 rounded-lg">
          {value.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-zinc-500 italic">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page number helper ─────────────────────────────────────────────────────────

function toPage(s) {
  const n = parseInt(String(s), 10);
  return s !== '' && !isNaN(n) ? n : null;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Book Detail View ───────────────────────────────────────────────────────────

function BookDetailView({ book, onBack, onOpenEdit, onBookChanged, initialTab = 'notes' }) {
  const [notes, setNotes] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [learnings, setLearnings] = useState([]);
  const [contentLoading, setContentLoading] = useState(true);
  const [detailTab, setDetailTab] = useState(initialTab);

  // Page editing
  const [editingPage, setEditingPage] = useState(false);
  const [pageInputVal, setPageInputVal] = useState('');
  const [savingPage, setSavingPage] = useState(false);
  const pageInputRef = useRef(null);

  // Notes form
  const [noteContent, setNoteContent] = useState('');
  const [notePage, setNotePage] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null); // { id, content, pageNumber }

  // Quotes form
  const [quoteText, setQuoteText] = useState('');
  const [quotePage, setQuotePage] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Learnings form
  const [learnTerm, setLearnTerm] = useState('');
  const [learnDef, setLearnDef] = useState('');
  const [learnPage, setLearnPage] = useState('');
  const [savingLearning, setSavingLearning] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState('');
  const [editingLearning, setEditingLearning] = useState(null); // { id, term, definition, pageNumber }

  useEffect(() => {
    setContentLoading(true);
    Promise.all([
      api.bookNotes.list(book.id),
      api.bookQuotes.list(book.id),
      api.bookLearnings.list({ bookId: book.id }),
    ]).then(([n, q, l]) => {
      setNotes(n);
      setQuotes(q);
      setLearnings(l);
    }).catch(() => {}).finally(() => setContentLoading(false));
  }, [book.id]);

  // ── Progress derived ───────────────────────────────────────────────────────

  const currentPage = book.currentPage ?? 0;
  const pct = book.totalPages > 0
    ? Math.min(100, Math.round((currentPage / book.totalPages) * 100))
    : null;
  const pagesLeft = book.totalPages ? Math.max(0, book.totalPages - currentPage) : null;
  const daysLeft = pagesLeft != null && pagesLeft > 0 ? Math.ceil(pagesLeft / 30) : null;

  // ── Page editing ───────────────────────────────────────────────────────────

  const startEditPage = () => {
    setPageInputVal(String(currentPage));
    setEditingPage(true);
    setTimeout(() => pageInputRef.current?.focus(), 0);
  };

  const commitPage = async () => {
    const n = parseInt(pageInputVal, 10);
    setEditingPage(false);
    if (isNaN(n) || n < 0 || n === currentPage) return;
    setSavingPage(true);
    try {
      const updated = await api.books.update(book.id, { currentPage: n });
      onBookChanged(updated);
    } catch {}
    setSavingPage(false);
  };

  // ── Notes ──────────────────────────────────────────────────────────────────

  const saveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      const note = await api.bookNotes.create({
        bookId: book.id,
        content: noteContent.trim(),
        pageNumber: toPage(notePage),
      });
      setNotes(prev => [note, ...prev]);
      setNoteContent('');
      setNotePage('');
    } catch {}
    setSavingNote(false);
  };

  const updateNote = async () => {
    if (!editingNote?.content?.trim()) return;
    try {
      const updated = await api.bookNotes.update(editingNote.id, {
        content: editingNote.content.trim(),
        pageNumber: toPage(editingNote.pageNumber),
      });
      setNotes(prev => prev.map(n => n.id === editingNote.id ? updated : n));
      setEditingNote(null);
    } catch {}
  };

  const deleteNote = async (id) => {
    try {
      await api.bookNotes.delete(id);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch {}
  };

  // ── Quotes ─────────────────────────────────────────────────────────────────

  const saveQuote = async () => {
    if (!quoteText.trim()) return;
    setSavingQuote(true);
    try {
      const quote = await api.bookQuotes.create({
        bookId: book.id,
        text: quoteText.trim(),
        pageNumber: toPage(quotePage),
      });
      setQuotes(prev => [quote, ...prev]);
      setQuoteText('');
      setQuotePage('');
    } catch {}
    setSavingQuote(false);
  };

  const deleteQuote = async (id) => {
    try {
      await api.bookQuotes.delete(id);
      setQuotes(prev => prev.filter(q => q.id !== id));
    } catch {}
  };

  const copyQuote = (quote) => {
    navigator.clipboard.writeText(quote.text).then(() => {
      setCopiedId(quote.id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  // ── Learnings ──────────────────────────────────────────────────────────────

  const explainTerm = async () => {
    if (!learnTerm.trim()) return;
    setExplaining(true);
    setExplainError('');
    try {
      const res = await api.ai.explainTerm(learnTerm.trim());
      setLearnDef(res.explanation);
    } catch (err) {
      setExplainError(err.message || 'Failed to get explanation');
    }
    setExplaining(false);
  };

  const saveLearning = async () => {
    if (!learnTerm.trim() || !learnDef.trim()) return;
    setSavingLearning(true);
    try {
      const learning = await api.bookLearnings.create({
        bookId: book.id,
        term: learnTerm.trim(),
        definition: learnDef.trim(),
        pageNumber: toPage(learnPage),
      });
      setLearnings(prev => [learning, ...prev]);
      setLearnTerm('');
      setLearnDef('');
      setLearnPage('');
      setExplainError('');
    } catch {}
    setSavingLearning(false);
  };

  const updateLearning = async () => {
    if (!editingLearning?.term?.trim() || !editingLearning?.definition?.trim()) return;
    try {
      const updated = await api.bookLearnings.update(editingLearning.id, {
        term: editingLearning.term.trim(),
        definition: editingLearning.definition.trim(),
        pageNumber: toPage(editingLearning.pageNumber),
      });
      setLearnings(prev => prev.map(l => l.id === editingLearning.id ? updated : l));
      setEditingLearning(null);
    } catch {}
  };

  const deleteLearning = async (id) => {
    try {
      await api.bookLearnings.delete(id);
      setLearnings(prev => prev.filter(l => l.id !== id));
    } catch {}
  };

  // ── Icon shortcuts ─────────────────────────────────────────────────────────

  const EditIcon = () => (
    <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />
  );
  const TrashIcon = () => (
    <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-3.5 h-3.5" />
  );

  const actionBtn = 'p-1.5 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800';

  const DETAIL_TABS = [
    { key: 'notes', label: 'Notes', count: notes.length },
    { key: 'quotes', label: 'Quotes', count: quotes.length },
    { key: 'learnings', label: 'Learnings', count: learnings.length },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Back bar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#09090b]">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer">
          <Icon d="M15 19l-7-7 7-7" className="w-4 h-4" />
          Back to Library
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Book header ── */}
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex gap-8 items-start">

            {/* Cover */}
            <div className="w-36 h-52 flex-shrink-0 rounded-2xl overflow-hidden shadow-xl">
              <CoverImage book={book} className="w-full h-full" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">

              {/* Title + Edit button */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight break-words">{book.title}</h1>
                  {book.author && <p className="text-base text-gray-500 dark:text-zinc-400 mt-0.5">{book.author}</p>}
                </div>
                <button onClick={onOpenEdit}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-zinc-500 transition-colors cursor-pointer whitespace-nowrap">
                  <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />
                  Edit book
                </button>
              </div>

              {/* Genre + Tags */}
              {(book.genre || (book.tags ?? []).length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {book.genre && (
                    <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-full">{book.genre}</span>
                  )}
                  {(book.tags ?? []).map(tag => (
                    <span key={tag} className="text-xs font-medium px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-full">{tag}</span>
                  ))}
                </div>
              )}

              {/* Status + Rating */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[book.status] ?? ''}`}>
                  {STATUS_LABEL[book.status] ?? book.status}
                </span>
                {book.rating != null && <StarRating rating={book.rating} />}
              </div>

              {/* Progress (reading only) */}
              {book.status === 'reading' && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-gray-500 dark:text-zinc-400 flex items-center gap-1">
                      Page{' '}
                      {editingPage ? (
                        <input
                          ref={pageInputRef}
                          type="number"
                          min={0}
                          max={book.totalPages ?? undefined}
                          value={pageInputVal}
                          onChange={e => setPageInputVal(e.target.value)}
                          onBlur={commitPage}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitPage();
                            if (e.key === 'Escape') setEditingPage(false);
                          }}
                          className="w-14 px-1 text-center border-b border-teal-500 bg-transparent text-gray-900 dark:text-white focus:outline-none"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          onClick={startEditPage}
                          title="Click to update current page"
                          className="font-semibold text-gray-700 dark:text-zinc-200 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer transition-colors underline decoration-dashed underline-offset-2 decoration-gray-300 dark:decoration-zinc-600"
                        >
                          {savingPage ? '…' : currentPage}
                        </button>
                      )}
                      {book.totalPages > 0 && (
                        <span className="text-gray-400 dark:text-zinc-500">of {book.totalPages}</span>
                      )}
                    </span>
                    {pct !== null && (
                      <span className="font-semibold text-teal-600 dark:text-teal-400">{pct}%</span>
                    )}
                  </div>
                  {pct !== null && (
                    <div className="h-2 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                    {pagesLeft != null && <span>{pagesLeft} pages left</span>}
                    {daysLeft != null && (
                      <>
                        <span className="text-gray-200 dark:text-zinc-700">·</span>
                        <span>~{daysLeft} day{daysLeft !== 1 ? 's' : ''} to finish</span>
                        <span className="text-[10px] text-gray-300 dark:text-zinc-700">(at 30 pages/day)</span>
                      </>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Detail tab bar (sticky within scroll) ── */}
        <div className="sticky top-0 bg-white dark:bg-[#09090b] border-b border-gray-100 dark:border-white/[0.06] z-10 px-6">
          <div className="max-w-4xl mx-auto">
            <nav className="flex gap-1 -mb-px">
              {DETAIL_TABS.map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none
                    ${detailTab === t.key
                      ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>
                  {t.label}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${detailTab === t.key ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-500'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="max-w-4xl mx-auto px-6 py-6 pb-16">

          {/* ── NOTES ── */}
          {detailTab === 'notes' && (
            <div>
              {/* New note form */}
              <div className="mb-6 p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-200 dark:border-zinc-700">
                <NoteEditor
                  value={noteContent}
                  onChange={setNoteContent}
                  onSave={saveNote}
                  saving={savingNote}
                />
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  <input
                    type="number" min={0} value={notePage}
                    onChange={e => setNotePage(e.target.value)}
                    placeholder="Page #"
                    className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 placeholder-gray-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button onClick={saveNote} disabled={savingNote || !noteContent.trim()}
                    className="ml-auto px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50">
                    {savingNote ? 'Saving…' : 'Save note'}
                  </button>
                </div>
              </div>

              {contentLoading && <div className="py-8 flex justify-center"><Spinner /></div>}
              {!contentLoading && notes.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">No notes yet — add your first one above.</p>
              )}

              <div className="space-y-4">
                {notes.map(note => (
                  <div key={note.id} className="p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06]">
                    {editingNote?.id === note.id ? (
                      <div>
                        <NoteEditor
                          value={editingNote.content}
                          onChange={v => setEditingNote(n => ({ ...n, content: v }))}
                          rows={4}
                        />
                        <div className="flex items-center gap-2 mt-3">
                          <input
                            type="number" min={0} value={editingNote.pageNumber}
                            onChange={e => setEditingNote(n => ({ ...n, pageNumber: e.target.value }))}
                            placeholder="Page #"
                            className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <button onClick={updateNote}
                            className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg cursor-pointer hover:bg-teal-700">
                            Save
                          </button>
                          <button onClick={() => setEditingNote(null)}
                            className="px-3 py-1.5 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer hover:text-gray-700 dark:hover:text-zinc-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 dark:text-zinc-500">{fmtDate(note.createdAt)}</span>
                            {note.pageNumber != null && (
                              <span className="text-xs bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-2 py-0.5 rounded-full">p. {note.pageNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setEditingNote({ id: note.id, content: note.content, pageNumber: note.pageNumber ?? '', mode: 'edit' })}
                              className={`${actionBtn} text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200`}>
                              <EditIcon />
                            </button>
                            <button onClick={() => deleteNote(note.id)}
                              className={`${actionBtn} text-gray-400 hover:text-rose-500`}>
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{note.content}</ReactMarkdown>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── QUOTES ── */}
          {detailTab === 'quotes' && (
            <div>
              {/* New quote form */}
              <div className="mb-6 p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-200 dark:border-zinc-700">
                <textarea
                  value={quoteText}
                  onChange={e => setQuoteText(e.target.value)}
                  placeholder="Paste or type a memorable quote from the book…"
                  rows={3}
                  className="w-full text-sm text-gray-700 dark:text-gray-200 bg-transparent outline-none resize-none leading-relaxed placeholder-gray-300 dark:placeholder-zinc-600"
                />
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                  <input
                    type="number" min={0} value={quotePage}
                    onChange={e => setQuotePage(e.target.value)}
                    placeholder="Page #"
                    className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 placeholder-gray-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button onClick={saveQuote} disabled={savingQuote || !quoteText.trim()}
                    className="ml-auto px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50">
                    {savingQuote ? 'Saving…' : 'Save quote'}
                  </button>
                </div>
              </div>

              {contentLoading && <div className="py-8 flex justify-center"><Spinner /></div>}
              {!contentLoading && quotes.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">No quotes yet — save a memorable passage above.</p>
              )}

              <div className="space-y-4">
                {quotes.map(quote => (
                  <div key={quote.id}
                    className="relative p-4 pl-5 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06] border-l-4 border-l-teal-400 dark:border-l-teal-500">
                    <blockquote className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed italic">
                      "{quote.text}"
                    </blockquote>
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        {quote.pageNumber != null && (
                          <span className="text-xs text-gray-400 dark:text-zinc-500">p. {quote.pageNumber}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => copyQuote(quote)}
                          title={copiedId === quote.id ? 'Copied!' : 'Copy to clipboard'}
                          className={`${actionBtn} text-gray-400 hover:text-teal-600 dark:hover:text-teal-400`}>
                          {copiedId === quote.id ? (
                            <Icon d="M5 13l4 4L19 7" className="w-3.5 h-3.5 text-teal-500" />
                          ) : (
                            <Icon
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                              className="w-3.5 h-3.5"
                            />
                          )}
                        </button>
                        <button onClick={() => deleteQuote(quote.id)}
                          className={`${actionBtn} text-gray-400 hover:text-rose-500`}>
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── LEARNINGS ── */}
          {detailTab === 'learnings' && (
            <div>
              {/* New learning form */}
              <div className="mb-6 p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-200 dark:border-zinc-700">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className={LABEL_CLS}>Term</label>
                      <button
                        onClick={explainTerm}
                        disabled={explaining || !learnTerm.trim()}
                        className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-40 cursor-pointer transition-colors">
                        {explaining ? <Spinner className="w-3 h-3" /> : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                          </svg>
                        )}
                        Explain it to me
                      </button>
                    </div>
                    <input
                      type="text" value={learnTerm}
                      onChange={e => setLearnTerm(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') explainTerm(); }}
                      placeholder="A word, concept, or idea from the book…"
                      className={INPUT_CLS}
                    />
                    {explainError && (
                      <p className="mt-1.5 text-xs text-rose-500">{explainError}</p>
                    )}
                  </div>
                  <div>
                    <label className={LABEL_CLS}>
                      Definition{' '}
                      <span className="normal-case font-normal text-gray-400 dark:text-zinc-500">— in your own words</span>
                    </label>
                    <textarea
                      value={learnDef}
                      onChange={e => setLearnDef(e.target.value)}
                      placeholder="Explain it as if telling a curious friend…"
                      rows={3}
                      className={INPUT_CLS + ' resize-none'}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} value={learnPage}
                      onChange={e => setLearnPage(e.target.value)}
                      placeholder="Page #"
                      className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 placeholder-gray-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      onClick={saveLearning}
                      disabled={savingLearning || !learnTerm.trim() || !learnDef.trim()}
                      className="ml-auto px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50">
                      {savingLearning ? 'Saving…' : 'Save learning'}
                    </button>
                  </div>
                </div>
              </div>

              {contentLoading && <div className="py-8 flex justify-center"><Spinner /></div>}
              {!contentLoading && learnings.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">No learnings yet — capture terms and concepts above.</p>
              )}

              <div className="space-y-3">
                {learnings.map(learning => (
                  <div key={learning.id} className="p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06]">
                    {editingLearning?.id === learning.id ? (
                      <div className="space-y-2.5">
                        <input
                          type="text" value={editingLearning.term}
                          onChange={e => setEditingLearning(l => ({ ...l, term: e.target.value }))}
                          placeholder="Term"
                          className={INPUT_CLS}
                        />
                        <textarea
                          value={editingLearning.definition}
                          onChange={e => setEditingLearning(l => ({ ...l, definition: e.target.value }))}
                          rows={3} placeholder="Definition"
                          className={INPUT_CLS + ' resize-none'}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min={0} value={editingLearning.pageNumber ?? ''}
                            onChange={e => setEditingLearning(l => ({ ...l, pageNumber: e.target.value }))}
                            placeholder="Page #"
                            className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <button onClick={updateLearning}
                            className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg cursor-pointer hover:bg-teal-700">
                            Save
                          </button>
                          <button onClick={() => setEditingLearning(null)}
                            className="px-3 py-1.5 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer hover:text-gray-700 dark:hover:text-zinc-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{learning.term}</p>
                          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                            <button
                              onClick={() => setEditingLearning({ id: learning.id, term: learning.term, definition: learning.definition, pageNumber: learning.pageNumber ?? '' })}
                              className={`${actionBtn} text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200`}>
                              <EditIcon />
                            </button>
                            <button onClick={() => deleteLearning(learning.id)}
                              className={`${actionBtn} text-gray-400 hover:text-rose-500`}>
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1.5 leading-relaxed">{learning.definition}</p>
                        {learning.pageNumber != null && (
                          <span className="inline-block mt-2.5 text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                            p. {learning.pageNumber}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

const GENRE_COLORS = [
  '#14b8a6', '#6366f1', '#f59e0b', '#ec4899',
  '#10b981', '#3b82f6', '#8b5cf6', '#f97316',
  '#06b6d4', '#84cc16', '#a855f7', '#ef4444',
];

function BooksPerYearChart({ byYear }) {
  const currentYear = new Date().getFullYear();
  const data = [...byYear].sort((a, b) => a.year - b.year);
  if (data.length === 0) return null;

  const VW = 800, VH = 210;
  const padL = 36, padR = 16, padT = 32, padB = 48;
  const chartW = VW - padL - padR;
  const chartH = VH - padT - padB;
  const n = data.length;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const slotW = chartW / n;
  const barW = Math.min(54, slotW * 0.65);

  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map(f => ({ frac: f, val: Math.round(maxCount * f), y: padT + chartH * (1 - f) }))
    .filter((t, i, arr) => i === 0 || t.val !== arr[i - 1].val);

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" aria-label="Books finished per year">
      {yTicks.map(t => (
        <g key={t.frac}>
          <line x1={padL} y1={t.y} x2={VW - padR} y2={t.y}
            stroke="currentColor" strokeWidth={0.75} opacity={0.1}
            className="text-gray-900 dark:text-white" />
          {t.val > 0 && (
            <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize={10}
              fill="currentColor" className="text-gray-400 dark:text-zinc-500">
              {t.val}
            </text>
          )}
        </g>
      ))}
      <line x1={padL} y1={padT + chartH} x2={VW - padR} y2={padT + chartH}
        stroke="currentColor" strokeWidth={1} opacity={0.1}
        className="text-gray-900 dark:text-white" />
      {data.map((d, i) => {
        const barH = Math.max(4, (d.count / maxCount) * chartH);
        const x = padL + i * slotW + (slotW - barW) / 2;
        const y = padT + chartH - barH;
        const isCurrent = d.year === currentYear;
        return (
          <g key={d.year}>
            <rect x={x} y={y} width={barW} height={barH} rx={5}
              fill={isCurrent ? '#14b8a6' : undefined}
              className={isCurrent ? '' : 'fill-gray-200 dark:fill-zinc-700'}
            />
            <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize={11}
              fontWeight={isCurrent ? '700' : '500'}
              fill={isCurrent ? '#14b8a6' : 'currentColor'}
              className={isCurrent ? '' : 'text-gray-400 dark:text-zinc-500'}>
              {d.count}
            </text>
            <text x={x + barW / 2} y={padT + chartH + 19} textAnchor="middle"
              fontSize={11} fontWeight={isCurrent ? '700' : '400'}
              fill={isCurrent ? '#14b8a6' : 'currentColor'}
              className={isCurrent ? '' : 'text-gray-400 dark:text-zinc-500'}>
              {d.year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function StatsTab({ stats, books, onOpenDetail }) {
  if (!stats) return null;
  const currentYear = new Date().getFullYear();

  // ── Yearly ──────────────────────────────────────────────────────────────────
  const finishedThisYear = useMemo(() =>
    books
      .filter(b => b.status === 'finished' && b.finishedAt &&
        new Date(b.finishedAt).getFullYear() === currentYear)
      .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt)),
    [books, currentYear]);

  const pagesThisYear = useMemo(() =>
    finishedThisYear.reduce((s, b) => s + (b.totalPages ?? 0), 0),
    [finishedThisYear]);

  const avgRatingThisYear = useMemo(() => {
    const rated = finishedThisYear.filter(b => b.rating != null);
    if (!rated.length) return null;
    return Math.round(rated.reduce((s, b) => s + b.rating, 0) / rated.length * 10) / 10;
  }, [finishedThisYear]);

  const goalPct = stats.yearlyGoal > 0
    ? Math.min(100, Math.round((stats.finishedThisYear / stats.yearlyGoal) * 100))
    : 0;
  const goalReached = stats.yearlyGoal > 0 && stats.finishedThisYear >= stats.yearlyGoal;
  const booksToGo = Math.max(0, stats.yearlyGoal - stats.finishedThisYear);

  // ── Genre ────────────────────────────────────────────────────────────────────
  const untaggedCount = useMemo(() => books.filter(b => !b.genre).length, [books]);
  const genreData = useMemo(() => {
    const data = [...stats.byGenre];
    if (untaggedCount > 0) data.push({ genre: 'Untagged', count: untaggedCount });
    return data;
  }, [stats.byGenre, untaggedCount]);
  const maxGenreCount = Math.max(...genreData.map(g => g.count), 1);
  const totalGenreBooks = genreData.reduce((s, g) => s + g.count, 0);

  // ── Ratings ──────────────────────────────────────────────────────────────────
  const ratingDist = useMemo(() => {
    const map = {};
    for (const b of books) {
      if (b.status === 'finished' && b.rating != null) map[b.rating] = (map[b.rating] ?? 0) + 1;
    }
    return [5, 4, 3, 2, 1].map(r => ({ rating: r, count: map[r] ?? 0 })).filter(r => r.count > 0);
  }, [books]);
  const maxRatingCount = Math.max(...ratingDist.map(r => r.count), 1);

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const timelineByYear = useMemo(() => {
    const groups = new Map();
    const finished = books
      .filter(b => b.status === 'finished' && b.finishedAt)
      .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    for (const b of finished) {
      const yr = new Date(b.finishedAt).getFullYear();
      if (!groups.has(yr)) groups.set(yr, []);
      groups.get(yr).push(b);
    }
    return [...groups.entries()].sort((a, b) => b[0] - a[0]);
  }, [books]);

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totalNotes = useMemo(() => books.reduce((s, b) => s + (b.notesCount ?? 0), 0), [books]);
  const mostReadGenre = stats.byGenre[0]?.genre ?? null;

  const fmtShort = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const STAR_PATH = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

  const Stars = ({ rating, size = 'w-3 h-3' }) => (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <svg key={s} className={`${size} ${s <= rating ? 'text-amber-400' : 'text-gray-200 dark:text-zinc-700'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </div>
  );

  const card = 'bg-white dark:bg-zinc-900/60 rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6';
  const secHead = 'text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-5';
  const muted = 'text-xs text-gray-400 dark:text-zinc-500 mt-0.5';

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-5 pb-16">

      {/* ── 1. Yearly Overview ── */}
      <div className={card}>
        <p className={secHead}>{currentYear} — Year at a Glance</p>

        <div className="flex items-start gap-8 mb-6">
          {/* Big number */}
          <div className="flex-shrink-0">
            <div className="text-6xl font-black text-gray-900 dark:text-white leading-none tabular-nums">
              {stats.finishedThisYear}
            </div>
            <div className={muted}>books finished</div>
          </div>

          {/* Goal progress */}
          <div className="flex-1 pt-1.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-zinc-400">
                {goalReached
                  ? '🎉 Goal reached!'
                  : `${booksToGo} book${booksToGo !== 1 ? 's' : ''} to go`}
              </span>
              <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">{goalPct}%</span>
            </div>
            <div className="h-3 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${goalReached ? 'bg-emerald-500' : 'bg-teal-500'}`}
                style={{ width: `${goalPct}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 dark:text-zinc-500 mt-1.5">Goal: {stats.yearlyGoal} books</div>
          </div>
        </div>

        {/* Metrics */}
        {(pagesThisYear > 0 || avgRatingThisYear != null) && (
          <div className="flex gap-8 mb-6 pb-6 border-b border-gray-100 dark:border-zinc-800">
            {pagesThisYear > 0 && (
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                  {pagesThisYear.toLocaleString()}
                </div>
                <div className={muted}>pages read this year</div>
              </div>
            )}
            {avgRatingThisYear != null && (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">{avgRatingThisYear}</span>
                  <span className="text-amber-400 text-xl leading-none">★</span>
                </div>
                <div className={muted}>avg rating this year</div>
              </div>
            )}
          </div>
        )}

        {/* Cover thumbnails */}
        {finishedThisYear.length > 0 ? (
          <div>
            <div className="text-xs text-gray-400 dark:text-zinc-500 mb-2.5">
              {finishedThisYear.length} book{finishedThisYear.length !== 1 ? 's' : ''} — in order
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {finishedThisYear.map(book => (
                <button
                  key={book.id}
                  onClick={() => onOpenDetail(book)}
                  title={book.title}
                  className="w-11 h-16 flex-shrink-0 rounded-lg overflow-hidden shadow-sm hover:scale-105 hover:shadow-md transition-all cursor-pointer hover:ring-2 hover:ring-teal-400 hover:ring-offset-1 dark:ring-offset-zinc-900">
                  <CoverImage book={book} className="w-full h-full" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            Mark books as "Finished" to track your year.
          </p>
        )}
      </div>

      {/* ── 2. Books per Year ── */}
      {stats.byYear.length > 0 && (
        <div className={card}>
          <p className={secHead}>Books Finished per Year</p>
          <BooksPerYearChart byYear={stats.byYear} />
        </div>
      )}

      {/* ── 3. Genre Breakdown ── */}
      {genreData.length > 0 && (
        <div className={card}>
          <p className={secHead}>Genre Breakdown</p>
          <div className="space-y-2.5">
            {genreData.map((g, i) => {
              const color = GENRE_COLORS[i % GENRE_COLORS.length];
              const pct = totalGenreBooks > 0 ? Math.round((g.count / totalGenreBooks) * 100) : 0;
              return (
                <div key={g.genre} className="flex items-center gap-3">
                  <div className="w-28 text-right text-xs font-medium text-gray-600 dark:text-zinc-300 truncate flex-shrink-0">
                    {g.genre}
                  </div>
                  <div className="flex-1 h-5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(g.count / maxGenreCount) * 100}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="w-20 text-xs text-gray-500 dark:text-zinc-400 flex-shrink-0">
                    {g.count} · {pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Ratings Distribution ── */}
      {ratingDist.length > 0 && (
        <div className={card}>
          <p className={secHead}>Ratings Distribution</p>
          {stats.averageRating != null && (
            <div className="flex items-baseline gap-2 mb-5">
              <span className="text-4xl font-black text-gray-900 dark:text-white">{stats.averageRating}</span>
              <span className="text-amber-400 text-2xl leading-none">★</span>
              <span className="text-sm text-gray-400 dark:text-zinc-500 ml-1">average across all finished books</span>
            </div>
          )}
          <div className="space-y-3">
            {ratingDist.map(({ rating, count }) => (
              <div key={rating} className="flex items-center gap-3">
                <div className="flex-shrink-0 w-24 flex justify-end">
                  <Stars rating={rating} size="w-4 h-4" />
                </div>
                <div className="flex-1 h-5 bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-700"
                    style={{ width: `${(count / maxRatingCount) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-xs font-semibold text-right text-gray-700 dark:text-zinc-300 flex-shrink-0">
                  {count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 5. Reading Timeline ── */}
      {timelineByYear.length > 0 && (
        <div className={card}>
          <p className={secHead}>Reading History</p>
          <div className="space-y-7">
            {timelineByYear.map(([year, yearBooks]) => (
              <div key={year}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-bold text-gray-800 dark:text-zinc-200">{year}</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                    {yearBooks.length} book{yearBooks.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-zinc-800" />
                </div>
                <div className="space-y-1">
                  {yearBooks.map(book => (
                    <button
                      key={book.id}
                      onClick={() => onOpenDetail(book)}
                      className="flex items-center gap-3 w-full text-left p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer group">
                      <div className="w-8 h-11 flex-shrink-0 rounded overflow-hidden shadow-sm">
                        <CoverImage book={book} className="w-full h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                          {book.title}
                        </p>
                        {book.author && (
                          <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">{book.author}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {book.rating != null && <Stars rating={book.rating} />}
                        {book.finishedAt && (
                          <span className="text-xs text-gray-400 dark:text-zinc-500 w-16 text-right">
                            {fmtShort(book.finishedAt)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. Library Totals ── */}
      <div>
        <p className={secHead}>Library Totals</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total in library', value: String(books.length) },
            { label: 'Finished', value: String(stats.totalFinished) },
            { label: 'Pages read', value: stats.totalPages > 0 ? stats.totalPages.toLocaleString() : '0' },
            { label: 'Quotes saved', value: String(stats.totalQuotes) },
            { label: 'Learnings', value: String(stats.totalLearnings) },
            { label: 'Notes', value: String(totalNotes) },
            mostReadGenre ? { label: 'Most-read genre', value: mostReadGenre, wide: true } : null,
          ].filter(Boolean).map(({ label, value, wide }) => (
            <div
              key={label}
              className={`bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06] p-4 ${wide ? 'sm:col-span-1' : ''}`}>
              <div className={`font-bold text-gray-900 dark:text-white leading-tight ${wide && value.length > 10 ? 'text-base' : 'text-2xl'}`}>
                {value}
              </div>
              <div className="text-xs text-gray-400 dark:text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Book Modal ─────────────────────────────────────────────────────────────────

const MODAL_STATUSES = [
  { key: 'reading', label: 'Reading' },
  { key: 'want-to-read', label: 'Want to Read' },
  { key: 'finished', label: 'Finished' },
  { key: 'dnf', label: 'DNF' },
];

function initForm(book) {
  if (!book) return {
    title: '', author: '', totalPages: '', currentPage: '',
    genre: '', tags: [], status: 'want-to-read',
    startedAt: '', finishedAt: '', rating: null,
    synopsis: '', dnfReason: '', recommendedBy: '',
    coverUrl: '', openLibraryKey: null,
  };
  return {
    title: book.title ?? '',
    author: book.author ?? '',
    totalPages: book.totalPages != null ? String(book.totalPages) : '',
    currentPage: book.currentPage != null ? String(book.currentPage) : '',
    genre: book.genre ?? '',
    tags: Array.isArray(book.tags) ? [...book.tags] : [],
    status: book.status ?? 'want-to-read',
    startedAt: book.startedAt ? book.startedAt.split('T')[0] : '',
    finishedAt: book.finishedAt ? book.finishedAt.split('T')[0] : '',
    rating: book.rating ?? null,
    synopsis: book.synopsis ?? '',
    dnfReason: book.dnfReason ?? '',
    recommendedBy: book.recommendedBy ?? '',
    coverUrl: book.coverUrl ?? '',
    openLibraryKey: book.openLibraryKey ?? null,
  };
}

function buildPayload(form) {
  return {
    title: form.title.trim(),
    author: form.author.trim() || null,
    totalPages: form.totalPages !== '' ? Number(form.totalPages) : null,
    currentPage: form.currentPage !== '' ? Number(form.currentPage) : 0,
    genre: form.genre.trim() || null,
    tags: form.tags,
    status: form.status,
    coverUrl: form.coverUrl.trim() || null,
    openLibraryKey: form.openLibraryKey || null,
    synopsis: form.synopsis.trim() || null,
    dnfReason: form.dnfReason.trim() || null,
    recommendedBy: form.recommendedBy.trim() || null,
    startedAt: form.startedAt ? new Date(form.startedAt + 'T12:00:00').toISOString() : null,
    finishedAt: form.finishedAt ? new Date(form.finishedAt + 'T12:00:00').toISOString() : null,
    rating: form.rating,
  };
}

function BookModal({ mode, book, existingGenres, onClose, onSaved, onDeleted }) {
  const isEdit = mode === 'edit';
  const [phase, setPhase] = useState(isEdit ? 'form' : 'search');
  const [form, setForm] = useState(() => initForm(book ?? null));
  const [titleError, setTitleError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [changingCover, setChangingCover] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);
  const queryRef = useRef(null);

  useEffect(() => { queryRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const handleQueryChange = (val) => {
    setQuery(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await api.books.searchOpenLibrary(val.trim());
        setResults(res);
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
  };

  const handleSelectResult = (result) => {
    setForm(f => ({
      ...f,
      title: result.title || f.title,
      author: result.author || f.author,
      totalPages: result.totalPages ? String(result.totalPages) : f.totalPages,
      coverUrl: result.coverUrl || f.coverUrl,
      openLibraryKey: result.openLibraryKey || f.openLibraryKey,
    }));
    setPhase('form');
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.title.trim()) { setTitleError('Title is required'); return; }
    setTitleError('');
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const saved = isEdit
        ? await api.books.update(book.id, payload)
        : await api.books.create(payload);
      onSaved(saved);
    } catch {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.books.delete(book.id);
      onDeleted();
    } catch { setDeleting(false); }
  };

  const modalTitle = isEdit ? (book?.title ? `Edit: ${book.title}` : 'Edit Book') : 'Add Book';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 animate-fade-in" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            {phase === 'form' && !isEdit && (
              <button onClick={() => setPhase('search')} className="text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors cursor-pointer">
                <Icon d="M15 19l-7-7 7-7" className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate max-w-sm">{modalTitle}</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex-shrink-0">
            <Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {phase === 'search' && (
            <div className="p-6">
              <div className="relative mb-3">
                <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
                <input
                  ref={queryRef}
                  type="text"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="Search by title or author"
                  className={INPUT_CLS + ' pl-9 pr-8'}
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="w-4 h-4" />
                  </div>
                )}
                {query && !searching && (
                  <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer">
                    <Icon d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  {results.length > 0 ? `${results.length} results from Open Library` : query && !searching ? 'No results found' : ''}
                </p>
                <button onClick={() => setPhase('form')} className="text-xs text-teal-600 dark:text-teal-400 hover:underline cursor-pointer font-medium">
                  Add manually →
                </button>
              </div>

              {results.length > 0 && (
                <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <button key={i} onClick={() => handleSelectResult(r)}
                      className="flex items-center gap-3 w-full text-left p-3 rounded-xl border border-gray-100 dark:border-white/[0.06] hover:border-teal-300 dark:hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-all cursor-pointer group">
                      <div className="w-10 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-zinc-800">
                        {r.coverUrl
                          ? <img src={r.coverUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">{r.title?.[0]?.toUpperCase()}</div>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate">{r.title}</p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">{r.author}</p>
                        {r.totalPages && <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{r.totalPages} pages</p>}
                      </div>
                      <Icon d="M12 4v16m8-8H4" className="w-4 h-4 text-gray-300 dark:text-zinc-600 group-hover:text-teal-500 transition-colors flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {!query && (
                <div className="py-8 text-center">
                  <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" className="w-8 h-8 mx-auto text-gray-200 dark:text-zinc-700 mb-2" />
                  <p className="text-sm text-gray-400 dark:text-zinc-500">Search Open Library or add manually</p>
                </div>
              )}
            </div>
          )}

          {phase === 'form' && (
            <div className="p-6 space-y-5">

              {/* Cover */}
              <div className="flex gap-4">
                <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-100 dark:border-white/[0.06]">
                  <CoverPreview url={form.coverUrl} title={form.title} />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  {changingCover ? (
                    <div className="flex flex-col gap-1.5">
                      <label className={LABEL_CLS}>Cover URL</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={form.coverUrl}
                          onChange={e => setField('coverUrl', e.target.value)}
                          placeholder="Paste image URL…"
                          className={INPUT_CLS}
                          autoFocus
                        />
                        <button type="button" onClick={() => setChangingCover(false)}
                          className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer whitespace-nowrap">
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setChangingCover(true)}
                      className="text-sm text-teal-600 dark:text-teal-400 hover:underline cursor-pointer text-left">
                      {form.coverUrl ? 'Change cover' : 'Add cover URL'}
                    </button>
                  )}
                  {form.coverUrl && !changingCover && (
                    <button type="button" onClick={() => setField('coverUrl', '')}
                      className="text-xs text-gray-400 dark:text-zinc-500 hover:text-rose-500 cursor-pointer text-left">
                      Remove cover
                    </button>
                  )}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className={LABEL_CLS}>Title <span className="text-rose-400">*</span></label>
                <input type="text" value={form.title} onChange={e => { setField('title', e.target.value); setTitleError(''); }}
                  className={INPUT_CLS + (titleError ? ' border-rose-400 focus:ring-rose-400' : '')}
                  placeholder="Book title" autoFocus={isEdit} />
                {titleError && <p className="text-xs text-rose-500 mt-1">{titleError}</p>}
              </div>

              {/* Author */}
              <div>
                <label className={LABEL_CLS}>Author</label>
                <input type="text" value={form.author} onChange={e => setField('author', e.target.value)}
                  className={INPUT_CLS} placeholder="Author name" />
              </div>

              {/* Pages + Genre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Total pages</label>
                  <input type="number" min={0} value={form.totalPages} onChange={e => setField('totalPages', e.target.value)}
                    className={INPUT_CLS} placeholder="—" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Genre</label>
                  <input type="text" list="genre-suggestions" value={form.genre} onChange={e => setField('genre', e.target.value)}
                    className={INPUT_CLS} placeholder="Fiction, History…" />
                  <datalist id="genre-suggestions">
                    {existingGenres.map(g => <option key={g} value={g} />)}
                  </datalist>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className={LABEL_CLS}>Tags</label>
                <TagsInput tags={form.tags} onChange={tags => setField('tags', tags)} />
              </div>

              {/* Recommended by */}
              <div>
                <label className={LABEL_CLS}>Recommended by</label>
                <input type="text" value={form.recommendedBy} onChange={e => setField('recommendedBy', e.target.value)}
                  className={INPUT_CLS} placeholder="A person, podcast, article…" />
              </div>

              {/* Status */}
              <div>
                <label className={LABEL_CLS}>Status</label>
                <div className="flex rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
                  {MODAL_STATUSES.map((s, i) => (
                    <button key={s.key} type="button" onClick={() => setField('status', s.key)}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors cursor-pointer
                        ${i > 0 ? 'border-l border-gray-200 dark:border-zinc-700' : ''}
                        ${form.status === s.key
                          ? 'bg-teal-600 text-white border-teal-600 dark:border-teal-600'
                          : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reading: started date + current page */}
              {form.status === 'reading' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Started reading</label>
                    <input type="date" value={form.startedAt} onChange={e => setField('startedAt', e.target.value)}
                      className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Current page</label>
                    <input type="number" min={0} value={form.currentPage} onChange={e => setField('currentPage', e.target.value)}
                      className={INPUT_CLS} placeholder="0" />
                  </div>
                </div>
              )}

              {/* Finished: dates + rating + synopsis */}
              {form.status === 'finished' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL_CLS}>Started</label>
                      <input type="date" value={form.startedAt} onChange={e => setField('startedAt', e.target.value)} className={INPUT_CLS} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Finished</label>
                      <input type="date" value={form.finishedAt} onChange={e => setField('finishedAt', e.target.value)} className={INPUT_CLS} />
                    </div>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Your rating</label>
                    <RatingPicker value={form.rating} onChange={r => setField('rating', r)} />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>What did you take away from this book?</label>
                    <textarea value={form.synopsis} onChange={e => setField('synopsis', e.target.value)}
                      rows={3} className={INPUT_CLS + ' resize-none'}
                      placeholder="Key insights, lessons, thoughts…" />
                  </div>
                </>
              )}

              {/* DNF */}
              {form.status === 'dnf' && (
                <div>
                  <label className={LABEL_CLS}>Why did you stop?</label>
                  <input type="text" value={form.dnfReason} onChange={e => setField('dnfReason', e.target.value)}
                    className={INPUT_CLS} placeholder="Didn't connect, too slow, not the right time…" />
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer (form phase only) */}
        {phase === 'form' && (
          <div className="flex items-center px-6 py-4 border-t border-gray-100 dark:border-white/[0.06] gap-3 flex-shrink-0">
            {isEdit && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                className="text-sm text-gray-400 dark:text-zinc-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors cursor-pointer">
                Delete
              </button>
            )}
            {isEdit && confirmDelete && (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-gray-500 dark:text-zinc-400">Delete book and all its notes, quotes, and learnings?</span>
                <button onClick={handleDelete} disabled={deleting}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 cursor-pointer disabled:opacity-50 whitespace-nowrap">
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer">
                  Cancel
                </button>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60 shadow-sm">
                {saving && <Spinner className="w-3.5 h-3.5 border-white border-t-transparent" />}
                {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add book'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}

// ── Add Learning Modal ────────────────────────────────────────────────────────

function AddLearningModal({ books, onClose, onSaved }) {
  const [bookId, setBookId] = useState(books[0]?.id ?? '');
  const [term, setTerm] = useState('');
  const [def, setDef] = useState('');
  const [page, setPage] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState('');
  const [saving, setSaving] = useState(false);

  const explainTerm = async () => {
    if (!term.trim()) return;
    setExplaining(true);
    setExplainError('');
    try {
      const res = await api.ai.explainTerm(term.trim());
      setDef(res.explanation);
    } catch (err) {
      setExplainError(err.message || 'Failed to get explanation');
    }
    setExplaining(false);
  };

  const save = async () => {
    if (!bookId || !term.trim() || !def.trim()) return;
    setSaving(true);
    try {
      const learning = await api.bookLearnings.create({
        bookId: Number(bookId),
        term: term.trim(),
        definition: def.trim(),
        pageNumber: page ? parseInt(page, 10) : null,
      });
      onSaved(learning);
    } catch {}
    setSaving(false);
  };

  const SPARK_PATH = 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add Learning</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors">
            <Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={LABEL_CLS}>Book</label>
            <select value={bookId} onChange={e => setBookId(e.target.value)}
              className={INPUT_CLS + ' cursor-pointer'}>
              {books.map(b => (
                <option key={b.id} value={b.id}>{b.title}{b.author ? ` — ${b.author}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={LABEL_CLS}>Term</label>
              <button onClick={explainTerm} disabled={explaining || !term.trim()}
                className="flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 disabled:opacity-40 cursor-pointer transition-colors">
                {explaining
                  ? <Spinner className="w-3 h-3" />
                  : <Icon d={SPARK_PATH} d2={null} className="w-3.5 h-3.5" />}
                Explain it to me
              </button>
            </div>
            <input type="text" value={term} onChange={e => setTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') explainTerm(); }}
              placeholder="A word, concept, or idea…"
              className={INPUT_CLS} />
            {explainError && <p className="mt-1.5 text-xs text-rose-500">{explainError}</p>}
          </div>
          <div>
            <label className={LABEL_CLS}>
              Definition{' '}
              <span className="normal-case font-normal text-gray-400 dark:text-zinc-500">— in your own words</span>
            </label>
            <textarea value={def} onChange={e => setDef(e.target.value)}
              placeholder="Explain it as if telling a curious friend…"
              rows={3}
              className={INPUT_CLS + ' resize-none'} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <input type="number" min={0} value={page} onChange={e => setPage(e.target.value)}
              placeholder="Page #"
              className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 placeholder-gray-300 dark:placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            <button onClick={onClose}
              className="ml-auto px-4 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 cursor-pointer transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !bookId || !term.trim() || !def.trim()}
              className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50">
              {saving ? 'Saving…' : 'Save learning'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Global Learnings Tab ──────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'az',     label: 'A–Z' },
  { key: 'book',   label: 'By book' },
];

function GlobalLearningsTab({ books, onOpenDetail, filterIds = null, onClearFilter }) {
  const [learnings, setLearnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bookFilter, setBookFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ term: '', definition: '', pageNumber: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.bookLearnings.list();
      setLearnings(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const bookMap = useMemo(() => {
    const m = {};
    for (const b of books) m[b.id] = b;
    return m;
  }, [books]);

  const booksWithLearnings = useMemo(() => {
    const ids = new Set(learnings.map(l => l.bookId));
    return books.filter(b => ids.has(b.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [books, learnings]);

  const uniqueBookCount = useMemo(() =>
    new Set(learnings.map(l => l.bookId)).size, [learnings]);

  const filtered = useMemo(() => {
    let items = [...learnings];

    if (filterIds !== null) {
      const idSet = new Set(filterIds);
      items = items.filter(l => idSet.has(l.id));
    }

    if (bookFilter !== 'all') {
      const id = parseInt(bookFilter, 10);
      items = items.filter(l => l.bookId === id);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(l =>
        l.term.toLowerCase().includes(q) || l.definition.toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case 'newest': items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
      case 'oldest': items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
      case 'az':     items.sort((a, b) => a.term.localeCompare(b.term)); break;
      case 'book':   items.sort((a, b) => {
        const ta = bookMap[a.bookId]?.title ?? '';
        const tb = bookMap[b.bookId]?.title ?? '';
        return ta.localeCompare(tb) || a.term.localeCompare(b.term);
      }); break;
    }

    return items;
  }, [learnings, filterIds, bookFilter, search, sort, bookMap]);

  const deleteLearning = async (id) => {
    try {
      await api.bookLearnings.delete(id);
      setLearnings(prev => prev.filter(l => l.id !== id));
    } catch {}
  };

  const startEdit = (l) => {
    setEditingId(l.id);
    setEditForm({ term: l.term, definition: l.definition, pageNumber: l.pageNumber ?? '' });
  };

  const commitEdit = async () => {
    if (!editForm.term.trim() || !editForm.definition.trim()) return;
    try {
      const updated = await api.bookLearnings.update(editingId, {
        term: editForm.term.trim(),
        definition: editForm.definition.trim(),
        pageNumber: editForm.pageNumber !== '' ? parseInt(editForm.pageNumber, 10) : null,
      });
      setLearnings(prev => prev.map(l => l.id === updated.id ? updated : l));
      setEditingId(null);
    } catch {}
  };

  const handleSaved = (learning) => {
    setLearnings(prev => [learning, ...prev]);
    setShowAddModal(false);
  };

  const actionBtn = 'p-1.5 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-zinc-800';

  const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
  const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 pb-16">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Learnings</h1>
          {!loading && (
            <p className="text-sm text-gray-400 dark:text-zinc-500 mt-0.5">
              {learnings.length} learning{learnings.length !== 1 ? 's' : ''} across {uniqueBookCount} book{uniqueBookCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer">
          <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
          Add learning
        </button>
      </div>

      {/* Quiz filter banner */}
      {filterIds !== null && (
        <div className="mb-4 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-center justify-between gap-3">
          <span className="text-xs text-amber-700 dark:text-amber-400">
            Showing {filterIds.length} missed learning{filterIds.length !== 1 ? 's' : ''} from your last quiz
          </span>
          <button onClick={onClearFilter}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer underline underline-offset-2 flex-shrink-0">
            Clear filter
          </button>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search terms or definitions…"
            className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer">
              <Icon d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Book filter */}
        <select value={bookFilter} onChange={e => setBookFilter(e.target.value)}
          className="pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%236b7280'%3E%3Cpath fill-rule='evenodd' d='M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1rem', appearance: 'none' }}>
          <option value="all">All books</option>
          {booksWithLearnings.map(b => (
            <option key={b.id} value={String(b.id)}>{b.title}</option>
          ))}
        </select>

        {/* Sort toggles */}
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
          {SORT_OPTIONS.map(o => (
            <button key={o.key} onClick={() => setSort(o.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer
                ${sort === o.key
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : learnings.length === 0 ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Your personal glossary starts here</p>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mb-5">
              Add words, concepts, or ideas from any book you're reading.
            </p>
            <button onClick={() => setShowAddModal(true)}
              disabled={books.length === 0}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50">
              Add your first learning
            </button>
            {books.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">Add a book to your library first.</p>
            )}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-gray-400 dark:text-zinc-500">No learnings match your search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(learning => {
            const book = bookMap[learning.bookId];
            const isEditing = editingId === learning.id;

            return (
              <div key={learning.id}
                className="p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06] hover:shadow-sm transition-shadow">
                {isEditing ? (
                  <div className="space-y-2.5">
                    <input type="text" value={editForm.term}
                      onChange={e => setEditForm(f => ({ ...f, term: e.target.value }))}
                      placeholder="Term"
                      className={INPUT_CLS} />
                    <textarea value={editForm.definition}
                      onChange={e => setEditForm(f => ({ ...f, definition: e.target.value }))}
                      rows={3} placeholder="Definition"
                      className={INPUT_CLS + ' resize-none'} />
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} value={editForm.pageNumber}
                        onChange={e => setEditForm(f => ({ ...f, pageNumber: e.target.value }))}
                        placeholder="Page #"
                        className="w-24 px-2 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent text-gray-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                      <button onClick={commitEdit}
                        className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg cursor-pointer hover:bg-teal-700">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs text-gray-500 dark:text-zinc-400 cursor-pointer hover:text-gray-700 dark:hover:text-zinc-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-bold text-gray-900 dark:text-white leading-snug">{learning.term}</p>
                      <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                        <button onClick={() => startEdit(learning)}
                          className={`${actionBtn} text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200`}>
                          <EditIcon />
                        </button>
                        <button onClick={() => deleteLearning(learning.id)}
                          className={`${actionBtn} text-gray-400 hover:text-rose-500`}>
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mt-1.5 leading-relaxed">{learning.definition}</p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.04]">
                      {book && (
                        <button
                          onClick={() => onOpenDetail(book, 'learnings')}
                          className="flex items-center gap-2 min-w-0 cursor-pointer group">
                          {book.coverUrl ? (
                            <img src={book.coverUrl} alt={book.title}
                              className="w-7 h-9 object-cover rounded shadow-sm flex-shrink-0 group-hover:opacity-80 transition-opacity" />
                          ) : (
                            <div className="w-7 h-9 rounded bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
                          )}
                          <div className="min-w-0 text-left">
                            <p className="text-xs font-medium text-gray-700 dark:text-zinc-300 truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{book.title}</p>
                            {book.author && <p className="text-xs text-gray-400 dark:text-zinc-500 truncate">{book.author}</p>}
                          </div>
                        </button>
                      )}
                      {learning.pageNumber != null && (
                        <span className="ml-auto text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full flex-shrink-0">
                          p. {learning.pageNumber}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && books.length > 0 && (
        <AddLearningModal
          books={books}
          onClose={() => setShowAddModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

const Q_COUNTS = [5, 10, 15];
const QUIZ_MIN = 5;

const STAR_PATH_QUIZ = 'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';

function QuizTab({ books, onGoToLearnings }) {
  const [phase, setPhase] = useState('setup'); // 'setup' | 'playing' | 'results'
  const [allLearnings, setAllLearnings] = useState([]);
  const [loadingLearnings, setLoadingLearnings] = useState(true);

  // Setup options
  const [qCount, setQCount] = useState(5);
  const [source, setSource] = useState('all'); // 'all' | 'reading' | 'book'
  const [sourceBookId, setSourceBookId] = useState('');

  // Playing state
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState([]); // { learning, result: 'got'|'missed'|'skipped' }

  // Results state
  const [insight, setInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  const loadQuiz = useCallback(async () => {
    try {
      const data = await api.bookLearnings.list();
      setAllLearnings(data);
    } catch {}
    setLoadingLearnings(false);
  }, []);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  const bookMap = useMemo(() => {
    const m = {};
    for (const b of books) m[b.id] = b;
    return m;
  }, [books]);

  const booksWithLearnings = useMemo(() => {
    const ids = new Set(allLearnings.map(l => l.bookId));
    return books.filter(b => ids.has(b.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [books, allLearnings]);

  useEffect(() => {
    if (source === 'book' && !sourceBookId && booksWithLearnings.length > 0) {
      setSourceBookId(String(booksWithLearnings[0].id));
    }
  }, [source, sourceBookId, booksWithLearnings]);

  const pool = useMemo(() => {
    if (source === 'all') return allLearnings;
    if (source === 'reading') {
      const readingIds = new Set(books.filter(b => b.status === 'reading').map(b => b.id));
      return allLearnings.filter(l => readingIds.has(l.bookId));
    }
    if (source === 'book' && sourceBookId) {
      return allLearnings.filter(l => l.bookId === parseInt(sourceBookId, 10));
    }
    return allLearnings;
  }, [allLearnings, books, source, sourceBookId]);

  const canStart = pool.length >= QUIZ_MIN;
  const actualCount = Math.min(qCount, pool.length);

  const startQuiz = useCallback(() => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQuestions(shuffled.slice(0, actualCount));
    setIdx(0);
    setUserAnswer('');
    setRevealed(false);
    setResults([]);
    setInsight('');
    setInsightError('');
    setPhase('playing');
  }, [pool, actualCount]);

  const advance = (result) => {
    const next = [...results, { learning: questions[idx], result }];
    setResults(next);
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      setUserAnswer('');
      setRevealed(false);
    } else {
      finishQuiz(next);
    }
  };

  const finishQuiz = (finalResults) => {
    setPhase('results');
    const missed = finalResults.filter(r => r.result === 'missed').map(r => r.learning);
    const got = finalResults.filter(r => r.result === 'got').length;
    if (missed.length > 0) {
      setInsightLoading(true);
      api.ai.quizInsight({
        score: got,
        total: finalResults.length,
        missedTerms: missed.map(l => ({ term: l.term, definition: l.definition })),
      }).then(res => {
        setInsight(res.insight);
        setInsightLoading(false);
      }).catch(err => {
        setInsightError(err.message || 'Could not generate insight.');
        setInsightLoading(false);
      });
    }
  };

  const reviewMissed = () => {
    const missedIds = results.filter(r => r.result === 'missed').map(r => r.learning.id);
    onGoToLearnings(missedIds);
  };

  if (loadingLearnings) {
    return <div className="py-12 flex justify-center"><Spinner /></div>;
  }

  // ── Setup screen ──────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const sourceOptions = [
      { key: 'all', label: 'All books' },
      { key: 'reading', label: 'Currently reading' },
      { key: 'book', label: 'Specific book' },
    ];

    return (
      <div className="max-w-xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-full bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Retention Quiz</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-sm mx-auto">
            Test yourself on what you've learned. Learnings are picked randomly from your library.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6 space-y-6">
          {/* Question count */}
          <div>
            <label className={LABEL_CLS}>Number of questions</label>
            <div className="flex gap-2 mt-1">
              {Q_COUNTS.map(n => (
                <button key={n} onClick={() => setQCount(n)}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors cursor-pointer
                    ${qCount === n
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-600 dark:hover:text-teal-400'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div>
            <label className={LABEL_CLS}>Source</label>
            <div className="flex gap-2 mt-1">
              {sourceOptions.map(o => (
                <button key={o.key} onClick={() => setSource(o.key)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border-2 transition-colors cursor-pointer
                    ${source === o.key
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-600 dark:hover:text-teal-400'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            {source === 'book' && (
              <div className="mt-2.5">
                {booksWithLearnings.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-500">No books with learnings yet.</p>
                ) : (
                  <select value={sourceBookId} onChange={e => setSourceBookId(e.target.value)}
                    className={INPUT_CLS + ' cursor-pointer mt-1'}>
                    {booksWithLearnings.map(b => (
                      <option key={b.id} value={String(b.id)}>{b.title}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Pool info */}
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            {canStart
              ? `${pool.length} learning${pool.length !== 1 ? 's' : ''} available — ${actualCount} will be selected randomly`
              : `${pool.length} of ${QUIZ_MIN} required learnings in this source.`}
          </p>

          {/* Start button */}
          <button onClick={startQuiz} disabled={!canStart}
            className="w-full py-3 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            Start Quiz
          </button>
          {!canStart && (
            <p className="text-xs text-center text-gray-400 dark:text-zinc-500 -mt-3">
              Add at least {QUIZ_MIN} learnings to this source to start a quiz.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Playing screen ────────────────────────────────────────────────────────────
  if (phase === 'playing') {
    const current = questions[idx];
    if (!current) return null;
    const book = bookMap[current.bookId];

    return (
      <div className="max-w-xl mx-auto px-6 py-8">
        {/* Progress */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm font-semibold text-gray-500 dark:text-zinc-400">
            Question {idx + 1} of {questions.length}
          </p>
          <div className="flex gap-1">
            {questions.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${
                i < idx
                  ? 'w-5 bg-teal-500'
                  : i === idx
                    ? 'w-5 bg-teal-600'
                    : 'w-5 bg-gray-200 dark:bg-zinc-700'
              }`} />
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-gray-100 dark:border-white/[0.06] p-8 mb-4">
          <p className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center leading-tight">
            {current.term}
          </p>

          <textarea
            value={userAnswer}
            onChange={e => setUserAnswer(e.target.value)}
            placeholder="What does this mean? Write what you remember…"
            rows={4}
            disabled={revealed}
            className={INPUT_CLS + ' resize-none disabled:opacity-60'}
          />

          {!revealed && (
            <button onClick={() => setRevealed(true)}
              className="mt-4 w-full py-2.5 text-sm font-semibold border-2 border-gray-200 dark:border-zinc-700 rounded-xl text-gray-600 dark:text-zinc-300 hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer">
              Show definition
            </button>
          )}

          {revealed && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/40 rounded-xl">
                <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wide mb-1.5">Definition</p>
                <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{current.definition}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => advance('got')}
                  className="flex-1 py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Got it
                </button>
                <button onClick={() => advance('missed')}
                  className="flex-1 py-2.5 text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Missed it
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Book credit + Skip */}
        <div className="flex items-center justify-between px-1">
          {book ? (
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              From: <span className="font-medium text-gray-600 dark:text-zinc-400">{book.title}</span>
            </p>
          ) : <span />}
          <button onClick={() => advance('skipped')}
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer transition-colors underline underline-offset-2">
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────────────────────
  const gotCount = results.filter(r => r.result === 'got').length;
  const missedResults = results.filter(r => r.result === 'missed');
  const skippedCount = results.filter(r => r.result === 'skipped').length;
  const isPerfect = gotCount === questions.length && questions.length > 0 && skippedCount === 0 && missedResults.length === 0;

  return (
    <div className="max-w-xl mx-auto px-6 py-8 pb-16 space-y-4">

      {/* Score card */}
      <div className="bg-white dark:bg-zinc-900/60 rounded-2xl border border-gray-100 dark:border-white/[0.06] p-8 text-center">
        {isPerfect && (
          <svg className="w-12 h-12 text-amber-400 mx-auto mb-3" fill="currentColor" viewBox="0 0 20 20">
            <path d={STAR_PATH_QUIZ} />
          </svg>
        )}
        <div className="text-5xl font-black text-gray-900 dark:text-white mb-1 tabular-nums leading-none">
          {gotCount}
          <span className="text-2xl font-bold text-gray-400 dark:text-zinc-500"> / {questions.length}</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1 mb-6">
          {isPerfect
            ? 'Perfect score! Every concept locked in.'
            : `${gotCount} correct · ${missedResults.length} missed${skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}`}
        </p>

        <div className="flex gap-2.5">
          <button onClick={startQuiz}
            className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl transition-colors cursor-pointer">
            Quiz me again
          </button>
          {missedResults.length > 0 && (
            <button onClick={reviewMissed}
              className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-teal-500 hover:text-teal-600 dark:hover:border-teal-600 dark:hover:text-teal-400 rounded-xl transition-colors cursor-pointer">
              Review missed
            </button>
          )}
          <button onClick={() => setPhase('setup')}
            className="px-4 py-2.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 cursor-pointer transition-colors rounded-xl">
            New quiz
          </button>
        </div>
      </div>

      {/* AI insight */}
      {(insightLoading || insight || insightError) && (
        <div className="p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-gray-100 dark:border-white/[0.06]">
          <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
            Claude's take
          </p>
          {insightLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500">
              <Spinner className="w-3.5 h-3.5" /> Generating insight…
            </div>
          )}
          {insight && <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{insight}</p>}
          {insightError && <p className="text-xs text-rose-500">{insightError}</p>}
        </div>
      )}

      {/* Missed learnings review */}
      {missedResults.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-3">
            Missed — {missedResults.length}
          </p>
          <div className="space-y-2.5">
            {missedResults.map(({ learning }) => {
              const book = bookMap[learning.bookId];
              return (
                <div key={learning.id}
                  className="p-4 bg-white dark:bg-zinc-900/60 rounded-xl border border-rose-100 dark:border-rose-900/30">
                  <p className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">{learning.term}</p>
                  <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">{learning.definition}</p>
                  {book && (
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2.5">
                      From: <span className="font-medium">{book.title}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page constants ─────────────────────────────────────────────────────────────

const TABS = [
  { key: 'library', label: 'Library' },
  { key: 'stats', label: 'Stats' },
  { key: 'learnings', label: 'Learnings' },
  { key: 'quiz', label: 'Quiz' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
  { key: 'want-to-read', label: 'Want to Read' },
  { key: 'dnf', label: 'DNF' },
];

// ── Main Export ────────────────────────────────────────────────────────────────

export function Bibliotheca() {
  const [tab, setTab] = useState('library');
  const [books, setBooks] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [collapsedShelves, setCollapsedShelves] = useState({});
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedBookInitialTab, setSelectedBookInitialTab] = useState('notes');
  const [bookModal, setBookModal] = useState(null);
  const [learningFilterIds, setLearningFilterIds] = useState(null);
  const firstLoad = useRef(true);

  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [bookList, statsData, settingsData] = await Promise.all([
        api.books.list(),
        api.books.stats(),
        api.bibliothecaSettings.get(),
      ]);
      setBooks(bookList);
      setStats(statsData);
      setSettings(settingsData);
      if (firstLoad.current) {
        firstLoad.current = false;
        if (bookList.some(b => b.status === 'reading')) setStatusFilter('reading');
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const existingGenres = useMemo(() =>
    [...new Set(books.map(b => b.genre).filter(Boolean))].sort(),
    [books]);

  const allFiltered = useMemo(() => {
    if (!search.trim()) return books;
    const q = search.toLowerCase();
    return books.filter(b => b.title.toLowerCase().includes(q) || (b.author ?? '').toLowerCase().includes(q));
  }, [books, search]);

  const readingBooks   = useMemo(() => allFiltered.filter(b => b.status === 'reading'), [allFiltered]);
  const finishedBooks  = useMemo(() => [...allFiltered.filter(b => b.status === 'finished')].sort((a, b) => (b.finishedAt || b.createdAt) > (a.finishedAt || a.createdAt) ? 1 : -1), [allFiltered]);
  const wantToReadBooks = useMemo(() => [...allFiltered.filter(b => b.status === 'want-to-read')].sort((a, b) => (a.wantToReadOrder ?? 0) - (b.wantToReadOrder ?? 0)), [allFiltered]);
  const dnfBooks       = useMemo(() => allFiltered.filter(b => b.status === 'dnf'), [allFiltered]);

  const showReading    = (statusFilter === 'all' || statusFilter === 'reading')      && readingBooks.length > 0;
  const showFinished   = (statusFilter === 'all' || statusFilter === 'finished')     && finishedBooks.length > 0;
  const showWantToRead = (statusFilter === 'all' || statusFilter === 'want-to-read') && wantToReadBooks.length > 0;
  const showDnf        = (statusFilter === 'all' || statusFilter === 'dnf')          && dnfBooks.length > 0;
  const isEmpty        = !loading && !showReading && !showFinished && !showWantToRead && !showDnf;

  const canDrag = !search.trim();

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const toggleShelf = key => setCollapsedShelves(prev => ({ ...prev, [key]: !prev[key] }));

  const handleUpdateGoal = async newGoal => {
    try { const updated = await api.bibliothecaSettings.update({ yearlyGoal: newGoal }); setSettings(updated); } catch {}
  };

  const handleBookUpdated = useCallback((updatedBook) => {
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? { ...b, ...updatedBook } : b));
    setSelectedBook(prev => prev && prev.id === updatedBook.id ? { ...prev, ...updatedBook } : prev);
  }, []);

  const handleModalSaved = useCallback((savedBook) => {
    load();
    setBookModal(null);
    if (savedBook) {
      setSelectedBook(prev => prev && prev.id === savedBook.id ? { ...prev, ...savedBook } : prev);
    }
  }, [load]);

  const handleModalDeleted = useCallback(() => {
    load();
    setBookModal(null);
    setSelectedBook(null);
  }, [load]);

  const openDetail = useCallback((b, tab = 'notes') => {
    setSelectedBook(b);
    setSelectedBookInitialTab(tab);
  }, []);

  const handleGoToLearnings = useCallback((missedIds) => {
    setTab('learnings');
    setLearningFilterIds(missedIds);
  }, []);

  const handleDragStart = useCallback(id => setDragId(id), []);
  const handleDragOver  = useCallback(id => { if (id !== dragId) setDragOverId(id); }, [dragId]);
  const handleDragEnd   = useCallback(() => { setDragId(null); setDragOverId(null); }, []);

  const handleDrop = useCallback(targetId => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const wtr = [...books.filter(b => b.status === 'want-to-read')].sort((a, b) => (a.wantToReadOrder ?? 0) - (b.wantToReadOrder ?? 0));
    const ids = wtr.map(b => b.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return; }
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    setBooks(prev => prev.map(b => { const idx = reordered.indexOf(b.id); return idx !== -1 ? { ...b, wantToReadOrder: idx } : b; }));
    reordered.forEach((id, idx) => api.books.update(id, { wantToReadOrder: idx }).catch(() => {}));
    setDragId(null); setDragOverId(null);
  }, [dragId, books]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {selectedBook ? (
        /* ── Book detail view ── */
        <BookDetailView
          book={selectedBook}
          onBack={() => setSelectedBook(null)}
          onOpenEdit={() => setBookModal({ mode: 'edit', book: selectedBook })}
          onBookChanged={handleBookUpdated}
          initialTab={selectedBookInitialTab}
        />
      ) : (
        /* ── Library / Tabs ── */
        <>
          {/* Tab bar */}
          <div className="flex-shrink-0 border-b border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#09090b] px-6">
            <nav className="flex gap-1 -mb-px">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-3.5 text-sm font-medium border-b-2 transition-colors cursor-pointer focus-visible:outline-none
                    ${tab === t.key ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'library' && (
              <div className="max-w-5xl mx-auto px-6 py-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bibliotheca</h1>
                    {stats && settings && <GoalProgress stats={stats} settings={settings} onUpdateGoal={handleUpdateGoal} />}
                  </div>
                  <button onClick={() => setBookModal({ mode: 'add' })}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm cursor-pointer">
                    <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
                    Add Book
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or author…"
                    className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all" />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 cursor-pointer">
                      <Icon d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status filter chips */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {STATUS_FILTERS.map(f => (
                    <button key={f.key} onClick={() => setStatusFilter(f.key)}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer
                        ${statusFilter === f.key ? 'bg-teal-600 text-white dark:bg-teal-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {loading && <div className="py-12 flex justify-center"><Spinner /></div>}

                {isEmpty && (
                  <div className="py-20 text-center">
                    <Icon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      className="w-12 h-12 mx-auto text-gray-200 dark:text-zinc-700 mb-4" />
                    {books.length === 0 ? (
                      <>
                        <p className="text-gray-500 dark:text-zinc-400 font-medium">No books yet</p>
                        <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1 mb-4">Add your first book to get started</p>
                        <button onClick={() => setBookModal({ mode: 'add' })} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer">Add a book</button>
                      </>
                    ) : search.trim() ? (
                      <>
                        <p className="text-gray-500 dark:text-zinc-400 font-medium">No books match "{search}"</p>
                        <button onClick={() => setSearch('')} className="mt-2 text-sm text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">Clear search</button>
                      </>
                    ) : (
                      <p className="text-gray-500 dark:text-zinc-400 font-medium">No {STATUS_FILTERS.find(f => f.key === statusFilter)?.label ?? ''} books yet</p>
                    )}
                  </div>
                )}

                {/* Currently Reading */}
                {showReading && (
                  <div className="mb-6">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">
                      <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                      Currently Reading
                      <span className="text-xs font-normal text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">{readingBooks.length}</span>
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {readingBooks.map(book => (
                        <ReadingCard key={book.id} book={book} onClick={openDetail} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Finished */}
                {showFinished && (
                  <ShelfSection title="Finished" count={finishedBooks.length} collapsed={!!collapsedShelves.finished} onToggle={() => toggleShelf('finished')}>
                    <div className="grid gap-3 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {finishedBooks.map(book => <BookCard key={book.id} book={book} onClick={openDetail} />)}
                    </div>
                  </ShelfSection>
                )}

                {/* Want to Read */}
                {showWantToRead && (
                  <ShelfSection title="Want to Read" count={wantToReadBooks.length} collapsed={!!collapsedShelves.wantToRead} onToggle={() => toggleShelf('wantToRead')}>
                    <div className="grid gap-3 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {wantToReadBooks.map((book, idx) => (
                        <BookCard key={book.id} book={book}
                          position={canDrag ? idx : undefined}
                          isDragging={dragId === book.id}
                          isDragOver={dragOverId === book.id && dragId !== book.id}
                          onDragStart={canDrag ? handleDragStart : null}
                          onDragOver={canDrag ? handleDragOver : null}
                          onDrop={canDrag ? handleDrop : null}
                          onDragEnd={canDrag ? handleDragEnd : null}
                          onClick={openDetail} />
                      ))}
                    </div>
                  </ShelfSection>
                )}

                {/* DNF */}
                {showDnf && (
                  <ShelfSection title="Did Not Finish" count={dnfBooks.length} collapsed={!!collapsedShelves.dnf} onToggle={() => toggleShelf('dnf')}>
                    <div className="grid gap-3 pb-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                      {dnfBooks.map(book => <BookCard key={book.id} book={book} onClick={openDetail} />)}
                    </div>
                  </ShelfSection>
                )}

              </div>
            )}

            {tab === 'stats' && (
              loading
                ? <div className="py-12 flex justify-center"><Spinner /></div>
                : <StatsTab stats={stats} books={books} onOpenDetail={openDetail} />
            )}

            {tab === 'learnings' && (
              <GlobalLearningsTab
                books={books}
                onOpenDetail={openDetail}
                filterIds={learningFilterIds}
                onClearFilter={() => setLearningFilterIds(null)}
              />
            )}

            {tab === 'quiz' && (
              <QuizTab books={books} onGoToLearnings={handleGoToLearnings} />
            )}
          </div>
        </>
      )}

      {/* Book modal (always accessible via createPortal) */}
      {bookModal && (
        <BookModal
          mode={bookModal.mode}
          book={bookModal.book ?? null}
          existingGenres={existingGenres}
          onClose={() => setBookModal(null)}
          onSaved={handleModalSaved}
          onDeleted={handleModalDeleted}
        />
      )}

    </div>
  );
}
