import { useEffect, useMemo, useState } from 'react';
import { useClearIgnoredTasks, useMissingTasks, usePlanning } from '../hooks/usePlannings';
import { useSections } from '../hooks/useSections';
import { useTasksContext } from '../context/TasksContext';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { TaskForm } from '../components/tasks/TaskForm';
import { PlanningToolbar, ALL_OWNERS } from '../components/planning/PlanningToolbar';
import { PlanningGrid } from '../components/planning/PlanningGrid';
import { ReviewMissingTasksModal } from '../components/planning/ReviewMissingTasksModal';
import { PlanningToast, type ToastAction } from '../components/planning/PlanningToast';
import { formatWeekdayDayMonth, indexTasks } from '../utils/planning';
import type { Task } from '../types';

interface PlanningViewProps {
  id: number;
  onBack: () => void;
}

const HIGHLIGHT_MS = 2600;

export function PlanningView({ id, onBack }: PlanningViewProps) {
  const { data: planning, isLoading, isError } = usePlanning(id);
  const { sections, createSection } = useSections();
  const { tasks, loading: tasksLoading, updateTask, toggleSubtask } = useTasksContext();
  // Only plannings with a section can have missing tasks.
  const { data: missingTasks = [] } = useMissingTasks(planning?.sectionId != null ? id : null);
  const clearIgnored = useClearIgnoredTasks();
  const [ownerFilter, setOwnerFilter] = useState(ALL_OWNERS);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [brushIndex, setBrushIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [wrapAll, setWrapAll] = useState(false);
  const [confirmShowIgnored, setConfirmShowIgnored] = useState(false);
  const [highlight, setHighlight] = useState<ReadonlySet<number>>(() => new Set());
  // Each toast gets its own id so a repeat message restarts the timer, but re-renders don't.
  const [toast, setToast] = useState<{ id: number; message: string; action?: ToastAction; tone?: 'neutral' | 'error' } | null>(null);

  useEffect(() => {
    if (!highlight.size) return;
    const t = setTimeout(() => setHighlight(new Set()), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [highlight]);

  const tasksById = useMemo(() => indexTasks(tasks), [tasks]);
  const owners = useMemo(
    () => [...new Set((planning?.items ?? []).map(i => i.owner).filter((o): o is string => !!o))].sort((a, b) => a.localeCompare(b)),
    [planning?.items],
  );
  // A filter on an owner that no longer exists would hide everything.
  const activeFilter = ownerFilter === ALL_OWNERS || owners.includes(ownerFilter) || ownerFilter.startsWith('__') ? ownerFilter : ALL_OWNERS;
  const ownersListId = `planning-owners-${id}`;

  // The brush follows its legend entry; it falls back to the first one if that entry is removed.
  const brush = planning && brushIndex < planning.legend.length ? brushIndex : 0;
  const brushColor = planning?.legend[brush]?.color ?? '#22c55e';

  if (isLoading) return <div className="flex justify-center py-24 text-gray-400"><Spinner /></div>;

  if (isError || !planning) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">This planning no longer exists.</p>
        <button onClick={onBack} className="text-sm text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">Back to all plannings</button>
      </div>
    );
  }

  const section = sections.find(s => s.id === planning.sectionId);
  const missingCount = section ? missingTasks.length : 0;
  const ignoredCount = planning.ignoredTaskIds.length;

  return (
    <div className="h-full flex flex-col">
      <PlanningToolbar planning={planning} section={section} owners={owners}
        ownerFilter={activeFilter} onOwnerFilterChange={setOwnerFilter} brush={brush} onBrushChange={setBrushIndex}
        onShowIgnored={() => setConfirmShowIgnored(true)} wrapAll={wrapAll} onWrapAllChange={setWrapAll}
        onExportError={message => setToast({ id: Date.now(), message, tone: 'error' })} onBack={onBack} />

      {missingCount > 0 && section && (
        <div role="status" className="flex-shrink-0 flex items-center gap-3 px-4 md:px-6 py-2 border-b border-teal-100 dark:border-teal-500/10 bg-teal-50/70 dark:bg-teal-500/[0.06] text-sm">
          <svg className="w-4 h-4 flex-shrink-0 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="min-w-0 text-gray-700 dark:text-zinc-300">
            {missingCount} task{missingCount === 1 ? '' : 's'} in{' '}
            <span className="inline-flex items-center gap-1 font-medium text-gray-900 dark:text-zinc-100">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: section.color }} />{section.name}
            </span>{' '}
            {missingCount === 1 ? "isn't" : "aren't"} in this planning
          </span>
          <button onClick={() => setReviewing(true)}
            className="ml-auto flex-shrink-0 px-3 py-1 rounded text-sm font-medium text-teal-700 hover:bg-teal-100 dark:text-teal-300 dark:hover:bg-teal-500/10 cursor-pointer">
            Review
          </button>
        </div>
      )}

      <datalist id={ownersListId}>
        {owners.map(o => <option key={o} value={o} />)}
      </datalist>
      <PlanningGrid planning={planning} tasksById={tasksById} tasksLoading={tasksLoading} ownerFilter={activeFilter}
        ownersListId={ownersListId} brushColor={brushColor} highlightTaskIds={highlight} wrapAll={wrapAll} onEditTask={setEditingTask}
        onToggleTaskDone={(task, done) => {
          // Exactly the Tasks page path: optimistic cache update, recurrence handled by the server.
          updateTask(task.id, { status: done ? 'done' : 'todo' }).catch(() => {});
        }}
        onToggleSubtaskDone={(taskId, subtaskId, done) => { toggleSubtask(taskId, subtaskId, done).catch(() => {}); }}
        onDeadlineSynced={({ title, to, undo }) => setToast({
          id: Date.now(),
          message: `Deadline of ${title} moved to ${formatWeekdayDayMonth(to)}`,
          action: { label: 'Undo', run: undo },
        })}
        onLinkedRemoved={count => setToast({
          id: Date.now(),
          message: count === 1
            ? 'Removed from this planning, the task itself is unchanged'
            : 'Removed from this planning, the tasks themselves are unchanged',
        })} />

      {reviewing && (
        <ReviewMissingTasksModal planning={planning} section={section} tasks={missingTasks}
          onClose={() => setReviewing(false)}
          onImported={taskIds => {
            // New rows have no owner yet: make sure an owner filter doesn't hide them.
            setOwnerFilter(ALL_OWNERS);
            setHighlight(new Set(taskIds));
          }} />
      )}

      {confirmShowIgnored && (
        <Modal
          title="Show ignored tasks again?"
          onClose={() => setConfirmShowIgnored(false)}
          footer={
            <>
              <button onClick={() => setConfirmShowIgnored(false)} className="px-4 py-3 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
              <button
                onClick={() => { clearIgnored.mutate(planning.id); setConfirmShowIgnored(false); }}
                className="px-4 py-3 min-h-[44px] bg-orange-500 text-white rounded hover:bg-orange-600 cursor-pointer active:opacity-90">
                Show them again
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {ignoredCount} task{ignoredCount === 1 ? '' : 's'} you removed from this planning or chose to ignore will be suggested
            again in the "not in this planning" banner. Nothing is added to the planning until you review them.
          </p>
        </Modal>
      )}

      {toast && <PlanningToast key={toast.id} message={toast.message} action={toast.action} tone={toast.tone} onDone={() => setToast(null)} />}

      {editingTask && (
        // Editing here changes the real task on purpose; the planning only reads it.
        <TaskForm initial={editingTask} sections={sections} onCreateSection={createSection}
          onSave={data => updateTask(editingTask.id, data)} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}
