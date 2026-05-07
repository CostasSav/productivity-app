import type { NoteListItem, Section } from '../../types';

interface NoteItemProps {
  note: NoteListItem;
  section: Section | null;
  selected: boolean;
  onClick: () => void;
  onDelete: (id: number) => void;
}

export function NoteItem({ note, section, selected, onClick, onDelete }: NoteItemProps) {
  const date = new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  let summaryPreview = '';
  if (note.summary) {
    try {
      const parsed = JSON.parse(note.summary);
      summaryPreview = parsed.summary ?? '';
    } catch {
      summaryPreview = '';
    }
  }

  return (
    <div
      onClick={onClick}
      className={`group flex items-start justify-between p-3 rounded-lg cursor-pointer transition-colors
        ${selected
          ? 'bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-700'
          : 'hover:bg-gray-50 border border-transparent dark:hover:bg-gray-700/50'}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`font-medium text-sm truncate ${selected ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-800 dark:text-gray-100'}`}>{note.title}</p>
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{date}</span>
        </div>
        {section && (
          <span className="inline-flex items-center gap-1 text-xs mt-0.5" style={{ color: section.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: section.color }} />
            {section.name}
          </span>
        )}
        {summaryPreview ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{summaryPreview}</p>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">No summary</p>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(note.id); }}
        className="ml-2 p-1 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        title="Delete note"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
