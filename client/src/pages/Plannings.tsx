import { useState } from 'react';
import { usePlanningsList, useUpdatePlanning, useDeletePlanning } from '../hooks/usePlannings';
import { useSections } from '../hooks/useSections';
import { NewPlanningModal } from '../components/planning/NewPlanningModal';
import { Spinner } from '../components/ui/Spinner';
import { formatPlanningRange } from '../utils/planning';
import type { PlanningSummary, Section } from '../types';

interface PlanningsProps {
  onOpen: (id: number) => void;
}

const iconBtn = 'p-1.5 rounded text-gray-400 dark:text-gray-500 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

export function Plannings({ onOpen }: PlanningsProps) {
  const { data: plannings = [], isLoading } = usePlanningsList();
  const { sections } = useSections();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="max-w-4xl mx-auto px-4 pt-20 pb-8 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Project Planning</h1>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors cursor-pointer"
        >
          <PlusIcon />
          New planning
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-12 text-gray-400"><Spinner /></div>}

      {!isLoading && plannings.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">🗓️</p>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">No plannings yet</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto">
            Lay out a project week by week. Start from a section to import its tasks.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors shadow-sm cursor-pointer"
          >
            <PlusIcon />
            Create your first planning
          </button>
        </div>
      )}

      {!isLoading && plannings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          {plannings.map(p => (
            <PlanningCard key={p.id} planning={p} section={sections.find(s => s.id === p.sectionId)} onOpen={() => onOpen(p.id)} />
          ))}
        </div>
      )}

      {showNew && (
        <NewPlanningModal
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); onOpen(id); }}
        />
      )}
    </div>
  );
}

function PlanningCard({ planning, section, onOpen }: { planning: PlanningSummary; section?: Section; onOpen: () => void }) {
  const updatePlanning = useUpdatePlanning();
  const deletePlanning = useDeletePlanning();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(planning.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (name && name !== planning.name) updatePlanning.mutate({ id: planning.id, data: { name } });
    else setDraft(planning.name);
  };

  // Clicks on the card's own controls must not open the planning.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const interactive = !renaming && !confirmDelete;

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={e => { if (interactive && e.key === 'Enter' && e.target === e.currentTarget) onOpen(); }}
      className={`group relative bg-white dark:bg-[#09090b] rounded border border-gray-200 dark:border-zinc-800/60 p-4 transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
        ${interactive ? 'cursor-pointer hover:border-teal-400 dark:hover:border-teal-500/60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              autoFocus value={draft} maxLength={200} aria-label="Planning name"
              onChange={e => setDraft(e.target.value)}
              onClick={stop}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setDraft(planning.name); setRenaming(false); }
              }}
              className="w-full border rounded px-2 py-1 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
          ) : (
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{planning.name}</h3>
          )}
          <p className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400 min-w-0">
            {section ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                <span className="truncate">{section.name}</span>
              </>
            ) : (
              <span className="italic">No section</span>
            )}
          </p>
        </div>

        {!renaming && !confirmDelete && (
          <div className="flex items-center flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
            <button onClick={e => { stop(e); setDraft(planning.name); setRenaming(true); }} title="Rename" aria-label="Rename planning"
              className={`${iconBtn} hover:text-teal-600 dark:hover:text-teal-400`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={e => { stop(e); setConfirmDelete(true); }} title="Delete" aria-label="Delete planning"
              className={`${iconBtn} hover:text-red-600 dark:hover:text-red-400`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 text-xs text-gray-500 dark:text-gray-400">
        <span>{formatPlanningRange(planning.startDate, planning.weekCount)}</span>
        <span><strong className="text-gray-800 dark:text-gray-100">{planning.itemCount}</strong> item{planning.itemCount === 1 ? '' : 's'}</span>
      </div>

      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800/60" onClick={stop}>
          <span className="w-full text-xs text-red-600 dark:text-red-400">Delete this planning? Your tasks are not affected.</span>
          <button onClick={() => deletePlanning.mutate(planning.id)}
            className="ml-auto px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer">Yes, delete</button>
          <button onClick={() => setConfirmDelete(false)}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 cursor-pointer">Cancel</button>
        </div>
      )}
    </div>
  );
}
