import { useState } from 'react';
import type { NoteListItem, Section } from '../../types';
import { NoteItem } from './NoteItem';

interface NoteListProps {
  notes: NoteListItem[];
  sections: Section[];
  loading: boolean;
  selectedId: number | null;
  filterSectionId?: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}

// â”€â”€ Skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonNoteItem() {
  return (
    <div className="p-3 rounded animate-pulse space-y-1.5">
      <div className="h-3.5 bg-gray-200 dark:bg-zinc-800 rounded w-4/5" />
      <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-2/3" />
    </div>
  );
}

// â”€â”€ NoteList â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function NoteList({ notes, sections, loading, selectedId, filterSectionId, onSelect, onNew, onDelete }: NoteListProps) {
  const [sectionFilter, setSectionFilter] = useState<number | null | 'all'>('all');

  const displayed = (() => {
    if (filterSectionId !== undefined) return notes.filter(n => n.section_id === filterSectionId);
    if (sectionFilter !== 'all') return notes.filter(n => n.section_id === sectionFilter);
    return notes;
  })();

  return (
    <div className="w-full md:w-72 md:flex-shrink-0 border-r border-gray-200 dark:border-zinc-800/60 flex flex-col h-full bg-white dark:bg-[#09090b]">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-zinc-800/60">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Notes</h2>
        {/* CTA â€” matches Habits/Tasks button style */}
        <button
          onClick={onNew}
          title="New note"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New note
        </button>
      </div>

      {filterSectionId === undefined && sections.length > 0 && (
        <div className="px-2 py-2 border-b border-gray-100 dark:border-zinc-800/60 flex flex-wrap gap-1">
          <button onClick={() => setSectionFilter('all')}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
            All
          </button>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSectionFilter(sectionFilter === s.id ? 'all' : s.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer"
              style={sectionFilter === s.id
                ? { backgroundColor: s.color, color: '#fff' }
                : { backgroundColor: s.color + '20', color: s.color }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Skeleton loading */}
        {loading && [1, 2, 3, 4].map(i => <SkeletonNoteItem key={i} />)}

        {/* Empty state */}
        {!loading && displayed.length === 0 && (
          <div className="text-center py-10 px-4">
            <svg viewBox="0 0 80 80" className="w-16 h-16 mx-auto mb-3" fill="none" aria-hidden>
              <rect x="12" y="8" width="56" height="64" rx="6" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="2" />
              <rect x="26" y="4" width="28" height="12" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5" />
              <line x1="22" y1="32" x2="58" y2="32" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
              <line x1="22" y1="44" x2="58" y2="44" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
              <line x1="22" y1="56" x2="44" y2="56" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">No notes yet</p>
            <button
              onClick={onNew}
              className="text-xs text-teal-600 dark:text-teal-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
            >
              Create one
            </button>
          </div>
        )}

        {displayed.map(note => (
          <NoteItem
            key={note.id}
            note={note}
            section={sections.find(s => s.id === note.section_id) ?? null}
            selected={note.id === selectedId}
            onClick={() => onSelect(note.id)}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

