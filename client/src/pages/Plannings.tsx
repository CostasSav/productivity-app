import { useEffect, useRef, useState } from 'react';
import { usePlanningsList, useUpdatePlanning, useDeletePlanning, useExportPlanning, readExportLang } from '../hooks/usePlannings';
import { DownloadIcon } from '../components/planning/ExportDialog';
import { PlanningToast } from '../components/planning/PlanningToast';
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
  const [error, setError] = useState<{ id: number; message: string } | null>(null);

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
            <PlanningCard key={p.id} planning={p} section={sections.find(s => s.id === p.sectionId)} onOpen={() => onOpen(p.id)}
              onExportError={message => setError({ id: Date.now(), message })} />
          ))}
        </div>
      )}

      {error && <PlanningToast key={error.id} message={error.message} tone="error" onDone={() => setError(null)} />}

      {showNew && (
        <NewPlanningModal
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); onOpen(id); }}
        />
      )}
    </div>
  );
}

function PlanningCard({ planning, section, onOpen, onExportError }: {
  planning: PlanningSummary; section?: Section; onOpen: () => void; onExportError: (message: string) => void;
}) {
  const updatePlanning = useUpdatePlanning();
  const deletePlanning = useDeletePlanning();
  const exportPlanning = useExportPlanning();
  // Default options, no dialog: last language used, every owner, done items included.
  const exportNow = () => exportPlanning.mutate(
    { id: planning.id, options: { lang: readExportLang(), includeDone: true } },
    { onError: e => onExportError(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}`) },
  );
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
          <CardMenu label={`Options for ${planning.name}`} busy={exportPlanning.isPending} items={[
            { label: exportPlanning.isPending ? 'Exporting…' : 'Export Excel', icon: <DownloadIcon />, onSelect: exportNow, disabled: exportPlanning.isPending },
            { label: 'Rename', onSelect: () => { setDraft(planning.name); setRenaming(true); } },
            { label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) },
          ]} />
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

interface CardMenuItem { label: string; icon?: React.ReactNode; danger?: boolean; disabled?: boolean; onSelect: () => void }

/** "⋯" menu of a card. Clicks never reach the card (which opens the planning). */
function CardMenu({ label, items, busy }: { label: string; items: CardMenuItem[]; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative flex-shrink-0" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} title="Options"
        className={`${iconBtn} hover:text-gray-700 dark:hover:text-zinc-200 ${busy ? 'text-teal-600' : ''}`}>
        {busy ? <Spinner size="sm" /> : (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
        )}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-44 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
          {items.map(item => (
            <button key={item.label} role="menuitem" disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50 cursor-pointer
                ${item.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]'}`}>
              {item.icon ?? <span className="w-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
