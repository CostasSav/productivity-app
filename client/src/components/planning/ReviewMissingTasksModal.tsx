import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { PriorityBadge, StatusBadge } from '../ui/Badge';
import { useIgnoreTasks, useImportTasks } from '../../hooks/usePlannings';
import { formatPlanningDate } from '../../utils/planning';
import type { PlanningDetail, Section, Task } from '../../types';

interface ReviewMissingTasksModalProps {
  planning: PlanningDetail;
  section?: Section;
  tasks: Task[];
  onImported: (taskIds: number[]) => void;
  onClose: () => void;
}

const ROOT = '';
const selectCls = 'border rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed';

/** Review section tasks the planning doesn't contain: add them (to Root or a group) or ignore them. */
export function ReviewMissingTasksModal({ planning, section, tasks, onImported, onClose }: ReviewMissingTasksModalProps) {
  const importTasks = useImportTasks();
  const ignoreTasks = useIgnoreTasks();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [targets, setTargets] = useState<Map<number, string>>(() => new Map());
  const [error, setError] = useState('');

  // The list is live: drop selections for tasks that are no longer missing.
  const visibleIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  const chosen = [...selected].filter(id => visibleIds.has(id));
  const allSelected = tasks.length > 0 && chosen.length === tasks.length;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = chosen.length > 0 && !allSelected;
  }, [chosen.length, allSelected]);

  const groups = [...planning.groups].filter(g => g.id > 0).sort((a, b) => a.order - b.order);
  const busy = importTasks.isPending || ignoreTasks.isPending;

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleAdd = async () => {
    setError('');
    const entries = tasks.filter(t => chosen.includes(t.id)).map(t => {
      const target = targets.get(t.id) ?? ROOT;
      return { taskId: t.id, groupId: t.subtasks.length || target === ROOT ? null : Number(target) };
    });
    try {
      await importTasks.mutateAsync({ planningId: planning.id, entries });
      onImported(entries.map(e => e.taskId));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the tasks');
    }
  };

  const handleIgnore = async () => {
    setError('');
    try {
      await ignoreTasks.mutateAsync({ planningId: planning.id, taskIds: chosen });
      setSelected(new Set());
      if (chosen.length === tasks.length) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not ignore the tasks');
    }
  };

  return (
    <Modal
      title="Tasks not in this planning"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-3 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
          <button onClick={handleIgnore} disabled={busy || chosen.length === 0}
            title="These tasks won't be suggested again. You can bring them back from the planning's menu."
            className="px-4 py-3 min-h-[44px] rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            Ignore selected
          </button>
          <button onClick={handleAdd} disabled={busy || chosen.length === 0}
            className="px-4 py-3 min-h-[44px] bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:opacity-90">
            {importTasks.isPending ? 'Adding...' : `Add selected${chosen.length ? ` (${chosen.length})` : ''}`}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {section ? <>Tasks of <strong className="text-gray-700 dark:text-gray-200">{section.name}</strong> that this planning doesn't contain yet. </> : null}
        Adding them links them to the planning; the tasks themselves are not changed.
      </p>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">All tasks of this section are in the planning.</p>
      ) : (
        <>
          <label className="flex items-center gap-3 px-2 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer">
            <input ref={selectAllRef} type="checkbox" checked={allSelected} disabled={busy}
              onChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map(t => t.id)))}
              className="w-4 h-4 accent-teal-600 cursor-pointer" />
            Select all ({tasks.length})
          </label>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {tasks.map(task => {
              const hasSubtasks = task.subtasks.length > 0;
              const checked = selected.has(task.id);
              const deadline = task.deadline?.slice(0, 10);
              return (
                <li key={task.id} className={`flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-2 px-2 py-2.5 ${checked ? 'bg-teal-50/60 dark:bg-teal-500/5' : ''}`}>
                  <label className="flex items-start gap-3 basis-full sm:basis-auto flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={checked} disabled={busy} onChange={() => toggle(task.id)}
                      className="mt-0.5 w-4 h-4 flex-shrink-0 accent-teal-600 cursor-pointer" />
                    <span className="min-w-0">
                      <span className={`block text-sm leading-snug ${task.status === 'done' ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-100'}`}>
                        {task.title}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <PriorityBadge priority={task.priority} />
                        <StatusBadge status={task.status} />
                        <span>{deadline ? formatPlanningDate(deadline) : 'No deadline'}</span>
                        {hasSubtasks && (
                          <span className="text-teal-700 dark:text-teal-400">
                            {task.subtasks.length} subtask{task.subtasks.length === 1 ? '' : 's'} → becomes a group
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                  <select
                    aria-label={`Where to add ${task.title}`}
                    value={hasSubtasks ? ROOT : targets.get(task.id) ?? ROOT}
                    disabled={busy || hasSubtasks}
                    title={hasSubtasks ? 'Tasks with subtasks become their own group, and groups are one level deep, so they always go at the root.' : 'Where to add this task'}
                    onChange={e => setTargets(prev => new Map(prev).set(task.id, e.target.value))}
                    className={`${selectCls} ml-7 sm:ml-0 w-40 flex-shrink-0`}>
                    <option value={ROOT}>{hasSubtasks ? 'Own group' : 'Root'}</option>
                    {!hasSubtasks && groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
