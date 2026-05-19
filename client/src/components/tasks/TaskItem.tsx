import { useState, useRef } from 'react';
import type { Task, Priority, Section } from '../../types';
import { PriorityBadge, StatusBadge } from '../ui/Badge';
import { SectionBadge } from '../sections/SectionBadge';
import { TaskForm } from './TaskForm';

const PRIORITY_BORDER: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
};
const PRIORITY_CYCLE: Record<Priority, Priority> = { high: 'medium', medium: 'low', low: 'high' };

// Shared class for icon-only action buttons â€” meets minimum touch target via padding
const iconBtn = 'p-2 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1';

function isOverdue(task: Task): boolean {
  if (!task.deadline || task.status === 'done') return false;
  return task.deadline < new Date().toISOString().split('T')[0];
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function recurrenceLabel(task: Task): string {
  if (!task.recurrence) return '';
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let label = '';
  if (task.recurrence === 'daily') label = 'Daily';
  else if (task.recurrence === 'weekly') label = task.recurrence_day !== null ? `Every ${DAYS[task.recurrence_day]}` : 'Weekly';
  else if (task.recurrence === 'monthly') label = task.recurrence_day ? `Monthly (day ${task.recurrence_day})` : 'Monthly';
  if (task.recurrence_time) label += ` · ${task.recurrence_time}`;
  return label;
}

interface TaskItemProps {
  task: Task;
  sections: Section[];
  onUpdate: (id: number, data: Partial<Task>) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onCreateSection: (name: string, color: string) => Promise<Section>;
  onAddSubtask: (taskId: number, title: string) => Promise<void>;
  onToggleSubtask: (taskId: number, subId: number, done: boolean) => Promise<void>;
  onDeleteSubtask: (taskId: number, subId: number) => Promise<void>;
  onFocusTask?: (task: Task) => void;
  pomodoroCount?: number;
}

export function TaskItem({ task, sections, onUpdate, onDelete, onCreateSection, onAddSubtask, onToggleSubtask, onDeleteSubtask, onFocusTask, pomodoroCount = 0 }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const overdue = isOverdue(task);
  const recurLabel = recurrenceLabel(task);
  const section = sections.find(s => s.id === task.section_id) ?? null;
  const doneCount = task.subtasks.filter(s => s.status === 'done').length;
  const totalCount = task.subtasks.length;

  const toggleDone = () => {
    if (task.status !== 'done') {
      setCompleting(true);
      setTimeout(() => setCompleting(false), 280);
    }
    onUpdate(task.id, { status: task.status === 'done' ? 'todo' : 'done' });
  };

  const cyclePriority = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(task.id, { priority: PRIORITY_CYCLE[task.priority] });
  };

  const handleAddSubtask = async () => {
    const title = newSubtaskTitle.trim();
    if (!title) return;
    await onAddSubtask(task.id, title);
    setNewSubtaskTitle('');
    subtaskInputRef.current?.focus();
  };

  return (
    <>
      <div className={`flex items-start gap-3 p-4 rounded border transition-colors
        ${completing ? 'animate-task-done' : ''}
        ${overdue ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'}
        ${task.status === 'done' && !completing ? 'opacity-60' : ''}`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${overdue ? 'bg-red-500' : PRIORITY_BORDER[task.priority]}`} />

        {/* Checkbox â€” wrapped for a larger tap target */}
        <label className="mt-0.5 flex-shrink-0 flex items-center justify-center w-6 h-6 cursor-pointer">
          <input
            type="checkbox"
            checked={task.status === 'done'}
            onChange={toggleDone}
            className="w-4 h-4 accent-teal-600 cursor-pointer"
          />
        </label>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>{task.title}</p>
            {recurLabel && (
              <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0"><svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> {recurLabel}</span>
            )}
          </div>
          {task.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{task.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              onClick={cyclePriority}
              title="Click to change priority"
              className="rounded-full hover:opacity-75 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
            >
              <PriorityBadge priority={task.priority} />
            </button>
            <StatusBadge status={task.status} />
            {section && <SectionBadge section={section} />}
            {task.deadline && (
              <span className={`text-xs font-medium font-mono tabular-nums ${overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {overdue ? 'âš  Overdue: ' : 'Due: '}{formatDate(task.deadline)}
              </span>
            )}
            {pomodoroCount > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500" title={`${pomodoroCount} Pomodoro session${pomodoroCount !== 1 ? 's' : ''} logged`}>
                ðŸ… {pomodoroCount}
              </span>
            )}
          </div>

          {/* Subtasks */}
          {(totalCount > 0 || addingSubtask) && (
            <div className="mt-3 pl-1 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
              {totalCount > 0 && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-400 rounded-full" style={{ transform: `scaleX(${doneCount / totalCount})`, transformOrigin: 'left', transition: 'transform 0.35s ease-out' }} />
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{doneCount}/{totalCount}</span>
                </div>
              )}
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 group/sub">
                  <input
                    type="checkbox"
                    checked={sub.status === 'done'}
                    onChange={e => onToggleSubtask(task.id, sub.id, e.target.checked)}
                    className="w-3.5 h-3.5 accent-teal-600 cursor-pointer flex-shrink-0"
                  />
                  <span className={`text-xs flex-1 ${sub.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>{sub.title}</span>
                  <button
                    onClick={() => onDeleteSubtask(task.id, sub.id)}
                    aria-label="Delete subtask"
                    className="opacity-0 group-hover/sub:opacity-100 p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:opacity-100 rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {addingSubtask && (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    ref={subtaskInputRef}
                    autoFocus
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtaskTitle(''); } }}
                    placeholder="Subtask title..."
                    className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                  <button onClick={handleAddSubtask} className="text-xs px-2 py-1.5 bg-teal-600 text-white rounded hover:bg-teal-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">Add</button>
                  <button onClick={() => { setAddingSubtask(false); setNewSubtaskTitle(''); }} className="text-xs px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded">âœ•</button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => { setAddingSubtask(true); }}
            className="mt-2 text-xs text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 rounded"
          >
            + Add subtask
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-0.5 flex-shrink-0">
          <button
            onClick={() => onUpdate(task.id, { pinnedToday: !task.pinnedToday })}
            title={task.pinnedToday ? 'Unpin from Today' : 'Pin to Today'}
            className={`${iconBtn} ${task.pinnedToday ? 'text-teal-600 dark:text-teal-400' : 'text-gray-300 hover:text-teal-400 dark:text-gray-600 dark:hover:text-teal-400'}`}
          >
            <svg className="w-4 h-4" fill={task.pinnedToday ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>

          {onFocusTask && task.status !== 'done' && (
            <button
              onClick={() => onFocusTask(task)}
              title="Focus with Pomodoro timer"
              className={`${iconBtn} text-gray-300 hover:text-teal-500 dark:text-gray-600 dark:hover:text-teal-400`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          <button
            onClick={() => setEditing(true)}
            title="Edit task"
            className={`${iconBtn} text-gray-300 hover:text-teal-500 dark:text-gray-600 dark:hover:text-teal-400`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={() => onDelete(task.id)}
            title="Delete task"
            className={`${iconBtn} text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {editing && (
        <TaskForm
          initial={task}
          sections={sections}
          onSave={data => onUpdate(task.id, data)}
          onClose={() => setEditing(false)}
          onCreateSection={onCreateSection}
        />
      )}
    </>
  );
}

