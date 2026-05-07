import { useState } from 'react';
import type { NoteListItem, Section } from '../../types';
import { NoteItem } from './NoteItem';
import { Spinner } from '../ui/Spinner';

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

export function NoteList({ notes, sections, loading, selectedId, filterSectionId, onSelect, onNew, onDelete }: NoteListProps) {
  const [sectionFilter, setSectionFilter] = useState<number | null | 'all'>('all');

  const displayed = (() => {
    if (filterSectionId !== undefined) return notes.filter(n => n.section_id === filterSectionId);
    if (sectionFilter !== 'all') return notes.filter(n => n.section_id === sectionFilter);
    return notes;
  })();

  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Notes</h2>
        <button onClick={onNew} className="w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-lg leading-none" title="New note">+</button>
      </div>

      {filterSectionId === undefined && sections.length > 0 && (
        <div className="px-2 py-2 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-1">
          <button onClick={() => setSectionFilter('all')}
            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
            All
          </button>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSectionFilter(sectionFilter === s.id ? 'all' : s.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors"
              style={sectionFilter === s.id
                ? { backgroundColor: s.color, color: '#fff' }
                : { backgroundColor: s.color + '20', color: s.color }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}
        {!loading && displayed.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No notes here.</p>
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
