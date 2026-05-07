import { useState } from 'react';
import type { Task, Priority, Section } from '../../types';
import { TaskItem } from './TaskItem';
import { TaskForm } from './TaskForm';
import { Spinner } from '../ui/Spinner';
import { useTasks } from '../../hooks/useTasks';
import { usePomodoroSessions } from '../../hooks/usePomodoroSessions';

interface TaskListProps {
  sections: Section[];
  onCreateSection: (name: string, color: string) => Promise<Section>;
  filterSectionId?: number | null;
  title?: string;
  onFocusTask?: (task: Task) => void;
}

export function TaskList({ sections, onCreateSection, filterSectionId, title = 'Tasks', onFocusTask }: TaskListProps) {
  const { tasks, loading, error, createTask, updateTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask } = useTasks();
  const { totalByTaskId: pomodoroCountByTaskId } = usePomodoroSessions();
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
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

  const filterBtnBase = 'px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors';
  const filterActive = 'bg-white shadow text-gray-900 dark:bg-gray-600 dark:text-white';
  const filterInactive = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';

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
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
        >
          + New Task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['all', 'active', 'done'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`${filterBtnBase} ${statusFilter === f ? filterActive : filterInactive}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
              All sections
            </button>
            {sections.map(s => (
              <button key={s.id} onClick={() => setSectionFilter(sectionFilter === s.id ? 'all' : s.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
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

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      {!loading && displayed.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-lg">{statusFilter === 'done' ? 'No completed tasks yet.' : 'No tasks here — create one!'}</p>
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
