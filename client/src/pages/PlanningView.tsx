import { useMemo, useState } from 'react';
import { usePlanning } from '../hooks/usePlannings';
import { useSections } from '../hooks/useSections';
import { useTasksContext } from '../context/TasksContext';
import { Spinner } from '../components/ui/Spinner';
import { TaskForm } from '../components/tasks/TaskForm';
import { PlanningToolbar, ALL_OWNERS } from '../components/planning/PlanningToolbar';
import { PlanningGrid } from '../components/planning/PlanningGrid';
import { indexTasks } from '../utils/planning';
import type { Task } from '../types';

interface PlanningViewProps {
  id: number;
  onBack: () => void;
}

export function PlanningView({ id, onBack }: PlanningViewProps) {
  const { data: planning, isLoading, isError } = usePlanning(id);
  const { sections, createSection } = useSections();
  const { tasks, loading: tasksLoading, updateTask } = useTasksContext();
  const [ownerFilter, setOwnerFilter] = useState(ALL_OWNERS);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [brushIndex, setBrushIndex] = useState(0);

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

  return (
    <div className="h-full flex flex-col">
      <PlanningToolbar planning={planning} section={sections.find(s => s.id === planning.sectionId)} owners={owners}
        ownerFilter={activeFilter} onOwnerFilterChange={setOwnerFilter} brush={brush} onBrushChange={setBrushIndex} onBack={onBack} />
      <datalist id={ownersListId}>
        {owners.map(o => <option key={o} value={o} />)}
      </datalist>
      <PlanningGrid planning={planning} tasksById={tasksById} tasksLoading={tasksLoading} ownerFilter={activeFilter}
        ownersListId={ownersListId} brushColor={brushColor} onEditTask={setEditingTask} />

      {editingTask && (
        // Editing here changes the real task on purpose; the planning only reads it.
        <TaskForm initial={editingTask} sections={sections} onCreateSection={createSection}
          onSave={data => updateTask(editingTask.id, data)} onClose={() => setEditingTask(null)} />
      )}
    </div>
  );
}
