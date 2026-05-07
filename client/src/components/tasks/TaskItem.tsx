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
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const overdue = isOverdue(task);
  const recurLabel = recurrenceLabel(task);
  const section = sections.find(s => s.id === task.section_id) ?? null;
  const doneCount = task.subtasks.filter(s => s.status === 'done').length;
  const totalCount = task.subtasks.length;

  const toggleDone = () => {
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
      <div className={`flex items-start gap-3 p-4 rounded-lg border transition-colors
        ${overdue ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-750'}
        ${task.status === 'done' ? 'opacity-60' : ''}`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${overdue ? 'bg-red-500' : PRIORITY_BORDER[task.priority]}`} />
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={toggleDone}
          className="mt-1 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>{task.title}</p>
            {recurLabel && (
              <span className="text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium flex-shrink-0">↻ {recurLabel}</span>
            )}
          </div>
          {task.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{task.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button onClick={cyclePriority} title="Click to change priority" className="rounded-full hover:opacity-75 transition-opacity">
              <PriorityBadge priority={task.priority} />
            </button>
            <StatusBadge status={task.status} />
            {section && <SectionBadge section={section} />}
            {task.deadline && (
              <span className={`text-xs font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {overdue ? '⚠ Overdue: ' : 'Due: '}{formatDate(task.deadline)}
              </span>
            )}
            {pomodoroCount > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500" title={`${pomodoroCount} Pomodoro session${pomodoroCount !== 1 ? 's' : ''} logged`}>
                🍅 {pomodoroCount}
              </span>
            )}
          </div>

          {/* Subtasks */}
          {(totalCount > 0 || addingSubtask) && (
            <div className="mt-3 pl-1 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
              {totalCount > 0 && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
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
                    className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer flex-shrink-0"
                  />
                  <span className={`text-xs flex-1 ${sub.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>{sub.title}</span>
                  <button
                    onClick={() => onDeleteSubtask(task.id, sub.id)}
                    className="opacity-0 group-hover/sub:opacity-100 p-0.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
                    className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:placeholder-gray-500"
                  />
                  <button onClick={handleAddSubtask} className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Add</button>
                  <button onClick={() => { setAddingSubtask(false); setNewSubtaskTitle(''); }} className="text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">✕</button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => { setAddingSubtask(true); }}
            className="mt-2 text-xs text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            + Add subtask
          </button>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {/* Pin to Today */}
          <button
            onClick={() => onUpdate(task.id, { pinnedToday: !task.pinnedToday })}
            className={`p-1.5 rounded transition-colors ${task.pinnedToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-200 hover:text-indigo-400 dark:text-gray-600 dark:hover:text-indigo-400'}`}
            title={task.pinnedToday ? 'Unpin from Today' : 'Pin to Today'}
          >
            <svg className="w-4 h-4" fill={task.pinnedToday ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
            </svg>
          </button>
          {onFocusTask && task.status !== 'done' && (
            <button onClick={() => onFocusTask(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 rounded" title="Focus with Pomodoro timer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
          )}
          <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 rounded" title="Edit">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => onDelete(task.id)} className="p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded" title="Delete">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
