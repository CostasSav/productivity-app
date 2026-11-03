import { useEffect, useRef, useState } from 'react';
import { useReorderPlanning, useUpdatePlanning } from '../../hooks/usePlannings';
import { useMobile } from '../../hooks/useMobile';
import { InlineText } from './InlineText';
import { ExportDialog, DownloadIcon } from './ExportDialog';
import { Modal } from '../ui/Modal';
import { mondayOf, formatPlanningRange, displayedOrderPayload, rootDisplayEntries } from '../../utils/planning';
import type { GroupSortMode, PlanningDetail, PlanningLegendEntry, Section, Task } from '../../types';

export const ALL_OWNERS = '__all__';
export const UNASSIGNED = '__none__';

const MAX_WEEKS = 520;
const SORT_MODES: { mode: GroupSortMode; label: string; hint: string }[] = [
  { mode: 'custom', label: 'Custom', hint: 'Your own order (drag groups to change it)' },
  { mode: 'deadline', label: 'Deadline', hint: 'Earliest last bar first; groups without bars last' },
  { mode: 'priority', label: 'Priority', hint: 'High, medium, low, then no priority' },
];
const LEGEND_PALETTE = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#eab308', '#14b8a6', '#64748b'];

const fieldCls = 'border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark]';
const labelCls = 'text-xs font-medium text-gray-500 dark:text-gray-400';
const stepBtn = 'w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

interface PlanningToolbarProps {
  planning: PlanningDetail;
  tasksById: Map<number, Task>;
  section?: Section;
  owners: string[];
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  brush: number;
  onBrushChange: (index: number) => void;
  onShowIgnored: () => void;
  wrapAll: boolean;
  onWrapAllChange: (wrap: boolean) => void;
  onExportError: (message: string) => void;
  onBack: () => void;
}

export function PlanningToolbar({ planning, tasksById, section, owners, ownerFilter, onOwnerFilterChange, brush, onBrushChange, onShowIgnored, wrapAll, onWrapAllChange, onExportError, onBack }: PlanningToolbarProps) {
  const [exporting, setExporting] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const updatePlanning = useUpdatePlanning();
  const reorder = useReorderPlanning();
  const sortMode = planning.groupSortMode ?? 'custom';
  const isMobile = useMobile();
  // On phones the controls fold away so the timeline keeps most of the screen.
  const [showControls, setShowControls] = useState(false);
  const update = (data: Parameters<typeof updatePlanning.mutate>[0]['data']) => updatePlanning.mutate({ id: planning.id, data });
  /** Writes the displayed order into the groups' `order` (replacing the manual one), then shows it as Custom. */
  const applyAsCustom = () => {
    setConfirmApply(false);
    reorder.mutate({ planningId: planning.id, ...displayedOrderPayload(rootDisplayEntries(planning, tasksById.values())) });
    update({ groupSortMode: 'custom' });
  };

  return (
    <div className="flex-shrink-0 px-4 md:px-6 pt-16 md:pt-4 pb-3 border-b border-gray-200 dark:border-zinc-800/60 bg-white dark:bg-[#09090b]">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onBack} aria-label="All plannings" title="All plannings"
          className="p-1 -ml-1 rounded text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <InlineText value={planning.name} required ariaLabel="Planning name" onCommit={name => update({ name })}
          className="text-xl font-bold text-gray-900 dark:text-white" inputClassName="text-xl font-bold max-w-md" />
        <span className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
          {section ? (
            <><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: section.color }} />{section.name}</>
          ) : <span className="italic">No section</span>}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setExporting(true)} title="Export to Excel" aria-label="Export Excel"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06] cursor-pointer">
            <DownloadIcon />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
          {isMobile && (
            <button onClick={() => setShowControls(s => !s)} aria-expanded={showControls}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
              {showControls ? 'Hide options' : 'Options'}
            </button>
          )}
          <PlanningMenu items={planning.ignoredTaskIds.length > 0 ? [{
            label: `Show ignored tasks again (${planning.ignoredTaskIds.length})`,
            hint: 'Tasks you removed or ignored will be suggested again',
            onSelect: onShowIgnored,
          }] : []} />
        </div>
      </div>

      {confirmApply && (
        <Modal title="Replace your custom order?" onClose={() => setConfirmApply(false)}
          footer={
            <>
              <button onClick={() => setConfirmApply(false)} className="px-4 py-3 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
              <button onClick={applyAsCustom}
                className="px-4 py-3 min-h-[44px] bg-teal-600 text-white rounded hover:bg-teal-700 cursor-pointer active:opacity-90">
                Replace custom order
              </button>
            </>
          }>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The groups will keep the order sorted by {sortMode} as your custom order, and the view switches to Custom.
            Your current manual order is replaced and can't be restored.
          </p>
        </Modal>
      )}

      {exporting && (
        <ExportDialog planningId={planning.id} owners={owners}
          initialOwner={ownerFilter !== ALL_OWNERS && ownerFilter !== UNASSIGNED ? ownerFilter : undefined}
          // Every group in on-screen order (same function as the grid); the server drops the ones a filter empties.
          groupIds={rootDisplayEntries(planning, tasksById.values()).flatMap(e => (e.kind === 'group' ? [e.id] : []))}
          onError={onExportError} onClose={() => setExporting(false)} />
      )}

      {(!isMobile || showControls) && <div className="flex flex-wrap items-end gap-x-5 gap-y-3 mt-3">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Start (Monday)</span>
          <input type="date" value={planning.startDate} className={fieldCls}
            onChange={e => { if (e.target.value) update({ startDate: mondayOf(e.target.value) }); }} />
        </label>

        <div className="flex flex-col gap-1">
          <label htmlFor="planning-target-date" className={labelCls}>Target</label>
          <div className="flex items-center gap-1">
            <input id="planning-target-date" type="date" value={planning.targetDate ?? ''} className={fieldCls}
              onChange={e => update({ targetDate: e.target.value || null })} />
            {planning.targetDate && (
              <button onClick={() => update({ targetDate: null })} aria-label="Clear target date" title="Clear target date"
                className="p-1 rounded text-gray-400 hover:text-red-600 cursor-pointer">×</button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelCls}>{formatPlanningRange(planning.startDate, planning.weekCount)}</span>
          <div className="flex items-center gap-1.5">
            <button className={stepBtn} aria-label="Remove a week" title="Remove a week" disabled={planning.weekCount <= 1}
              onClick={() => update({ weekCount: planning.weekCount - 1 })}>−</button>
            <span className="text-sm text-gray-700 dark:text-gray-200 tabular-nums w-16 text-center">{planning.weekCount} weeks</span>
            <button className={stepBtn} aria-label="Add a week" title="Add a week" disabled={planning.weekCount >= MAX_WEEKS}
              onClick={() => update({ weekCount: planning.weekCount + 1 })}>+</button>
          </div>
        </div>

        <LegendEditor legend={planning.legend} onChange={legend => update({ legend })} />

        {planning.legend.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Brush</span>
            <div role="radiogroup" aria-label="Color for new bars"
              title="Drag across empty weeks of a row to draw a bar in this color (long-press first on touch screens)"
              className="flex items-center gap-1.5 min-h-[30px]">
              {planning.legend.map((entry, i) => (
                <button key={i} role="radio" aria-checked={i === brush} onClick={() => onBrushChange(i)}
                  title={`Draw new bars as "${entry.label || 'Untitled'}"`} aria-label={entry.label || `Color ${i + 1}`}
                  className={`w-6 h-6 rounded-full cursor-pointer transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
                    ${i === brush ? 'ring-2 ring-offset-2 ring-gray-500 dark:ring-zinc-300 dark:ring-offset-[#09090b] scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: entry.color }} />
              ))}
            </div>
          </div>
        )}

        {/* Display controls stay together on the right, and wrap as one block on narrow screens. */}
        <div className="ml-auto flex items-end gap-x-5 gap-y-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <span id="group-order-label" className={labelCls}>Order</span>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-labelledby="group-order-label"
              className="flex rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
              {SORT_MODES.map(({ mode, label, hint }, i) => (
                <button key={mode} type="button" role="radio" aria-checked={sortMode === mode} title={hint}
                  onClick={() => { if (mode !== sortMode) update({ groupSortMode: mode }); }}
                  className={`px-2.5 py-1 text-sm cursor-pointer transition-colors ${i ? 'border-l border-gray-200 dark:border-gray-600' : ''}
                    ${sortMode === mode
                      ? 'bg-teal-50 text-teal-700 font-medium dark:bg-teal-500/10 dark:text-teal-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>
                  {label}
                </button>
              ))}
            </div>
            {sortMode !== 'custom' && (
              <button type="button" onClick={() => setConfirmApply(true)}
                title="Save this order as your custom order"
                className="px-2 py-1 rounded text-sm text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-500/10 cursor-pointer whitespace-nowrap">
                Apply as custom order
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelCls}>Names</span>
          <button type="button" aria-pressed={wrapAll} onClick={() => onWrapAllChange(!wrapAll)}
            title={wrapAll ? 'Show names on one line' : 'Show every name in full'}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-sm cursor-pointer transition-colors
              ${wrapAll
                ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300'
                : 'border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h13a3 3 0 010 6h-4m0 0l2-2m-2 2l2 2M4 18h5" />
            </svg>
            Wrap all names
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelCls}>Owner</span>
          <select value={ownerFilter} onChange={e => onOwnerFilterChange(e.target.value)} className={fieldCls}>
            <option value={ALL_OWNERS}>All owners</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
            <option value={UNASSIGNED}>Unassigned</option>
          </select>
        </label>
        </div>
      </div>}
    </div>
  );
}

// ── Planning menu ─────────────────────────────────────────────────────────────

interface MenuEntry { label: string; hint?: string; onSelect: () => void }

/** "⋯" menu for occasional planning actions; hidden when it has nothing to offer. */
function PlanningMenu({ items }: { items: MenuEntry[] }) {
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
  if (items.length === 0) return null;

  return (
    <div ref={root} className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Planning options" title="Planning options"
        className="p-1.5 rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-64 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
          {items.map(item => (
            <button key={item.label} role="menuitem" onClick={() => { setOpen(false); item.onSelect(); }}
              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/[0.06] cursor-pointer">
              <span className="block text-sm text-gray-800 dark:text-gray-100">{item.label}</span>
              {item.hint && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

/** <input type="color"> only accepts #rrggbb. */
function toInputColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map(c => c + c).join('')}`;
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
  return '#000000';
}

function LegendEditor({ legend, onChange }: { legend: PlanningLegendEntry[]; onChange: (legend: PlanningLegendEntry[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(legend);
  const root = useRef<HTMLDivElement>(null);

  // Edits stay local while the panel is open and are saved once on close,
  // so dragging a color picker doesn't fire a request per pixel.
  const close = () => {
    setOpen(false);
    const cleaned = draft.map(e => ({ ...e, label: e.label.trim() }));
    if (JSON.stringify(cleaned) !== JSON.stringify(legend)) onChange(cleaned);
  };
  const latestClose = useRef(close);
  latestClose.current = close;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) latestClose.current(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') latestClose.current(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const setEntry = (i: number, patch: Partial<PlanningLegendEntry>) =>
    setDraft(d => d.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <div ref={root} className="relative flex flex-col gap-1">
      <span className={labelCls}>Legend</span>
      <button
        onClick={() => { if (open) close(); else { setDraft(legend); setOpen(true); } }}
        aria-expanded={open}
        className="flex items-center flex-wrap gap-x-3 gap-y-1 min-h-[30px] px-2 py-1 rounded border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:border-teal-500 cursor-pointer"
      >
        {legend.length === 0 && <span className="text-gray-400">Add colors…</span>}
        {legend.map((e, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: e.color }} />
            {e.label || <span className="italic text-gray-400">Untitled</span>}
          </span>
        ))}
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-40 w-72 p-3 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl space-y-2">
          {draft.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" value={toInputColor(e.color)} aria-label={`Color for ${e.label || 'entry'}`}
                onChange={ev => setEntry(i, { color: ev.target.value })}
                className="w-8 h-8 p-0.5 rounded border border-gray-200 dark:border-gray-600 bg-transparent cursor-pointer flex-shrink-0" />
              <input value={e.label} maxLength={60} placeholder="Label" aria-label="Legend label"
                onChange={ev => setEntry(i, { label: ev.target.value })}
                onKeyDown={ev => { if (ev.key === 'Enter') close(); }}
                className={`${fieldCls} flex-1 min-w-0`} />
              <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} aria-label="Remove entry" title="Remove"
                className="p-1 rounded text-gray-400 hover:text-red-600 cursor-pointer">×</button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button disabled={draft.length >= 20}
              onClick={() => setDraft(d => [...d, { color: LEGEND_PALETTE[d.length % LEGEND_PALETTE.length], label: '' }])}
              className="text-sm text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-40 cursor-pointer">+ Add entry</button>
            <button onClick={close} className="px-3 py-1 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 cursor-pointer">Done</button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Pick the color for new bars with the brush. Existing bars keep their color.</p>
        </div>
      )}
    </div>
  );
}
