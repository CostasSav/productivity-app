import { useState } from 'react';
import type { Task, Priority, Section } from '../../types';
import { TaskItem } from './TaskItem';
import { TaskForm } from './TaskForm';
import { useTasksContext } from '../../context/TasksContext';
import { usePomodoroSessions } from '../../hooks/usePomodoroSessions';

interface TaskListProps {
  sections: Section[];
  onCreateSection: (name: string, color: string) => Promise<Section>;
  filterSectionId?: number | null;
  title?: string;
  onFocusTask?: (task: Task) => void;
}

// â”€â”€ Skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SkeletonTaskItem() {
  return (
    <div className="flex items-start gap-3 p-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 animate-pulse">
      <div className="w-4 h-4 mt-1 rounded bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="flex gap-2 mt-2">
          <div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
      </div>
      <div className="flex gap-1">
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

// â”€â”€ Empty state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TasksEmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="text-center py-16">
      <svg viewBox="0 0 80 80" className="w-20 h-20 mx-auto mb-6" fill="none" aria-hidden>
        <rect x="8" y="8" width="64" height="64" rx="4" stroke="#e2e8f0" strokeWidth="3" className="dark:stroke-gray-600" />
        <line x1="20" y1="32" x2="60" y2="32" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-gray-600" />
        <line x1="20" y1="48" x2="44" y2="48" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-gray-600" />
      </svg>
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">No tasks yet</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto">
        Create your first task to start tracking your work.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 transition-colors shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Create your first task
      </button>
    </div>
  );
}

// â”€â”€ TaskList â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function TaskList({ sections, onCreateSection, filterSectionId, title = 'Tasks', onFocusTask }: TaskListProps) {
  const { tasks, loading, error, createTask, updateTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask } = useTasksContext();
  const { totalByTaskId: pomodoroCountByTaskId } = usePomodoroSessions();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('active');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [sectionFilter, setSectionFilter] = useState<number | null | 'all'>(
    filterSectionId !== undefined ? filterSectionId : 'all'
  );

  const sectionFiltered = (() => {
    if (filterSectionId !== undefined) return tasks.filter(t => t.section_id === filterSectionId);
    if (sectionFilter !== 'all') return tasks.filter(t => t.section_id === sectionFilter);
    return tasks;
  })();

  const displayed = sectionFiltered.filter(t => {
    if (statusFilter === 'active') return t.status !== 'done';
    if (statusFilter === 'done') return t.status === 'done';
    return true;
  }).filter(t => priorityFilter === 'all' || t.priority === priorityFilter);

  const overdueCount = sectionFiltered.filter(t =>
    t.deadline && t.status !== 'done' && t.deadline < new Date().toISOString().split('T')[0]
  ).length;

  const defaultSectionId = filterSectionId !== undefined ? filterSectionId :
    (sectionFilter !== 'all' ? sectionFilter : null);

  const filterBtnBase = 'px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';
  const filterActive = 'bg-white shadow text-gray-900 dark:bg-gray-600 dark:text-white';
  const filterInactive = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

  const isFiltered = statusFilter !== 'all' || priorityFilter !== 'all';
  const isReallyEmpty = !loading && sectionFiltered.length === 0 && !isFiltered;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {overdueCount > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{overdueCount} overdue</p>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded p-1">
          {(['all', 'active', 'done'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`${filterBtnBase} ${statusFilter === f ? filterActive : filterInactive}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded p-1">
          <button onClick={() => setPriorityFilter('all')}
            className={`${filterBtnBase} text-xs ${priorityFilter === 'all' ? filterActive : filterInactive}`}>
            All
          </button>
          {([['high', 'bg-red-400'], ['medium', 'bg-yellow-400'], ['low', 'bg-green-400']] as const).map(([p, color]) => (
            <button key={p} onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)}
              className={`flex items-center gap-1.5 ${filterBtnBase} text-xs ${priorityFilter === p ? filterActive : filterInactive}`}>
              <span className={`w-2 h-2 rounded-full ${color}`} />{p}
            </button>
          ))}
        </div>

        {/* Section filter */}
        {filterSectionId === undefined && sections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setSectionFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
              All sections
            </button>
            {sections.map(s => (
              <button key={s.id} onClick={() => setSectionFilter(sectionFilter === s.id ? 'all' : s.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer"
                style={sectionFilter === s.id
                  ? { backgroundColor: s.color, color: '#fff' }
                  : { backgroundColor: s.color + '20', color: s.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sectionFilter === s.id ? '#fff' : s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>}

      {/* Skeleton loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <SkeletonTaskItem key={i} />)}
        </div>
      )}

      {/* True empty state (no tasks at all, no active filter) */}
      {isReallyEmpty && <TasksEmptyState onNew={() => setShowForm(true)} />}

      {/* Filtered empty */}
      {!loading && !isReallyEmpty && displayed.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-base">{statusFilter === 'done' ? 'No completed tasks yet.' : 'No tasks match this filter.'}</p>
        </div>
      )}

      <div className="space-y-2 overflow-y-auto flex-1">
        {displayed.map(task => (
          <div key={task.id} className="relative">
            <TaskItem task={task} sections={sections} onUpdate={updateTask} onDelete={deleteTask} onCreateSection={onCreateSection} onAddSubtask={addSubtask} onToggleSubtask={toggleSubtask} onDeleteSubtask={deleteSubtask} onFocusTask={onFocusTask} pomodoroCount={pomodoroCountByTaskId[task.id] ?? 0} />
          </div>
        ))}
      </div>

      {showForm && (
        <TaskForm
          initial={{ section_id: defaultSectionId }}
          sections={sections}
          onSave={createTask}
          onClose={() => setShowForm(false)}
          onCreateSection={onCreateSection}
        />
      )}
    </div>
  );
}

