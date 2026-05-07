import { useState } from 'react';
import type { Task, Section } from '../../types';
import { TaskForm } from '../tasks/TaskForm';

interface CalendarViewProps {
  tasks: Task[];
  sections: Section[];
  onUpdateTask: (id: number, data: Partial<Task>) => Promise<unknown>;
  onCreateTask: (data: Partial<Task>) => Promise<unknown>;
  onCreateSection: (name: string, color: string) => Promise<Section>;
  filterSectionId?: number | null;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
};

function toLocalDateKey(isoDate: string): string {
  return isoDate.split('T')[0];
}

function buildCalendar(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(startDow).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    week.push(dateStr);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

export function CalendarView({ tasks, sections, onUpdateTask, onCreateTask, onCreateSection, filterSectionId }: CalendarViewProps) {
  const today = new Date().toISOString().split('T')[0];
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [sectionFilter, setSectionFilter] = useState<number | null | 'all'>('all');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const weeks = buildCalendar(year, month);
  const activeSectionFilter = filterSectionId !== undefined ? filterSectionId : (sectionFilter !== 'all' ? sectionFilter : null);

  const tasksByDate: Record<string, Task[]> = {};
  for (const task of tasks) {
    if (!task.deadline || task.status === 'done') continue;
    if (activeSectionFilter != null && task.section_id !== activeSectionFilter) continue;
    const key = toLocalDateKey(task.deadline);
    if (!tasksByDate[key]) tasksByDate[key] = [];
    tasksByDate[key].push(task);
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{MONTHS[month]} {year}</h1>
          <button onClick={goToday} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">Today</button>
        </div>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Section filter chips */}
      {filterSectionId === undefined && sections.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button onClick={() => setSectionFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
            All sections
          </button>
          {sections.map(s => (
            <button key={s.id} onClick={() => setSectionFilter(sectionFilter === s.id ? 'all' : s.id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={sectionFilter === s.id ? { backgroundColor: s.color, color: '#fff' } : { backgroundColor: s.color + '20', color: s.color }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-xs font-semibold text-gray-400 dark:text-gray-500 text-center py-2">{d}</div>
          ))}
        </div>

        <div className="flex-1 grid gap-1 overflow-hidden" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((dateStr, di) => {
                if (!dateStr) return <div key={di} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-transparent" />;

                const dayTasks = tasksByDate[dateStr] ?? [];
                const isToday = dateStr === today;
                const isPast = dateStr < today;
                const hasOverdue = isPast && dayTasks.length > 0;
                const isDragOver = dragOverDate === dateStr;

                return (
                  <div
                    key={dateStr}
                    className={`rounded-lg border p-1.5 flex flex-col cursor-pointer transition-colors min-h-[80px]
                      ${isDragOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-300' :
                        isToday ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' :
                        hasOverdue ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
                        'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'}`}
                    onClick={() => setCreatingForDate(dateStr)}
                    onDragOver={e => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverDate(null);
                      const id = Number(e.dataTransfer.getData('taskId'));
                      if (id && dateStr) onUpdateTask(id, { deadline: dateStr });
                      setDraggingTaskId(null);
                    }}
                  >
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${isToday && !isDragOver ? 'bg-indigo-600 text-white' : isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                      {parseInt(dateStr.split('-')[2], 10)}
                    </span>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 3).map(task => (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('taskId', String(task.id));
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingTaskId(task.id);
                          }}
                          onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); }}
                          onClick={e => { e.stopPropagation(); setEditingTask(task); }}
                          className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-grab active:cursor-grabbing transition-opacity
                            ${draggingTaskId === task.id ? 'opacity-40' : ''}
                            ${task.deadline! < today
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                              : 'bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-indigo-800/50 dark:hover:text-indigo-300'}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                          <span className="truncate">{task.title}</span>
                          {task.recurrence && <span className="flex-shrink-0 opacity-60">↻</span>}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">+{dayTasks.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-gray-700 mt-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">Priority:</span>
        {(['high', 'medium', 'low'] as const).map(p => (
          <span key={p} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} /> {p}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-2">↻ recurring</span>
      </div>

      {editingTask && (
        <TaskForm initial={editingTask} sections={sections} onSave={data => onUpdateTask(editingTask.id, data)} onClose={() => setEditingTask(null)} onCreateSection={onCreateSection} />
      )}
      {creatingForDate && (
        <TaskForm initial={{ deadline: creatingForDate, section_id: activeSectionFilter ?? undefined }} sections={sections} onSave={data => onCreateTask(data)} onClose={() => setCreatingForDate(null)} onCreateSection={onCreateSection} />
      )}
    </div>
  );
}
