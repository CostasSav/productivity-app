import { useState, useEffect } from 'react';
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

const PRIORITY_HEX: Record<string, string> = {
  high: '#f87171',
  medium: '#fbbf24',
  low: '#4ade80',
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
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedDate) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedDate(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedDate]);

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
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{MONTHS[month]} {year}</h1>
          <button onClick={goToday} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">Today</button>
        </div>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
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
      <div className="flex-1 flex flex-col">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-xs font-semibold text-gray-400 dark:text-gray-500 text-center py-2">{d}</div>
          ))}
        </div>

        <div className="flex-1 grid gap-1" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((dateStr, di) => {
                if (!dateStr) return <div key={di} className="rounded bg-gray-50 dark:bg-[#09090b]/60 border border-transparent" />;

                const dayTasks = tasksByDate[dateStr] ?? [];
                const isToday = dateStr === today;
                const isPast = dateStr < today;
                const hasOverdue = isPast && dayTasks.length > 0;
                const isDragOver = dragOverDate === dateStr;

                const isExpanded = expandedDate === dateStr;

                return (
                  <div
                    key={dateStr}
                    className={`relative rounded border p-1.5 flex flex-col cursor-pointer transition-colors min-h-[80px]
                      ${isExpanded ? 'z-20' : ''}
                      ${isDragOver ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20 ring-2 ring-teal-300' :
                        isToday ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20' :
                        hasOverdue ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
                        'border-gray-200 bg-white hover:bg-gray-50 dark:border-zinc-800/60 dark:bg-[#09090b] dark:hover:bg-[#0e0e10]'}`}
                    onClick={() => { if (!isExpanded) setCreatingForDate(dateStr); }}
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
                    <span className={`text-xs font-semibold font-mono w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${isToday && !isDragOver ? 'bg-teal-600 text-white' : isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
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
                          className={`group flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-grab active:cursor-grabbing transition-opacity
                            ${draggingTaskId === task.id ? 'opacity-40' : ''}
                            ${task.deadline! < today
                              ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                              : 'bg-gray-100 text-gray-700 hover:bg-teal-100 hover:text-teal-700 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-teal-800/50 dark:hover:text-teal-300'}`}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); onUpdateTask(task.id, { status: 'done' }); }}
                            title="Mark as done"
                            className="w-3 h-3 rounded-full flex-shrink-0 border flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                            style={{ borderColor: PRIORITY_HEX[task.priority] }}
                          >
                            <svg
                              className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: PRIORITY_HEX[task.priority] }}
                              fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 12 12"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6l3 3 5.5-5" />
                            </svg>
                          </button>
                          <span className="truncate">{task.title}</span>
                          {task.recurrence && <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedDate(dateStr); }}
                          className="text-xs text-teal-600 dark:text-teal-400 hover:underline pl-1 text-left cursor-pointer"
                        >
                          +{dayTasks.length - 3} more
                        </button>
                      )}
                    </div>

                    {/* In-place expanded overlay */}
                    {isExpanded && (
                      <div
                        className={`absolute top-0 bg-white dark:bg-[#111113] border border-teal-400 rounded-lg shadow-xl z-20 flex flex-col ${di >= 4 ? 'right-0' : 'left-0'}`}
                        style={{ minWidth: '220px', maxHeight: '280px' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 dark:border-zinc-800/60 flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <button
                            onClick={() => setExpandedDate(null)}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Task list */}
                        <div className="overflow-y-auto flex-1 p-1 space-y-0.5">
                          {dayTasks.map(task => (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={e => {
                                e.dataTransfer.setData('taskId', String(task.id));
                                e.dataTransfer.effectAllowed = 'move';
                                setDraggingTaskId(task.id);
                              }}
                              onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); setExpandedDate(null); }}
                              className={`group/row flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-grab active:cursor-grabbing transition-opacity
                                ${draggingTaskId === task.id ? 'opacity-40' : ''}`}
                            >
                              <button
                                onClick={() => onUpdateTask(task.id, { status: 'done' })}
                                title="Mark as done"
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0 border flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
                                style={{ borderColor: PRIORITY_HEX[task.priority] }}
                              >
                                <svg
                                  className="w-2 h-2 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  style={{ color: PRIORITY_HEX[task.priority] }}
                                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 12 12"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6l3 3 5.5-5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { setExpandedDate(null); setEditingTask(task); }}
                                className="flex-1 text-left text-xs text-gray-700 dark:text-gray-200 truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
                              >
                                {task.title}
                              </button>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                            </div>
                          ))}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-gray-200 dark:border-zinc-800/60 px-1.5 py-1 flex-shrink-0">
                          <button
                            onClick={() => { setExpandedDate(null); setCreatingForDate(dateStr); }}
                            className="flex items-center gap-1 w-full px-1.5 py-1 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add task
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-zinc-800/60 mt-2">
        <span className="text-xs text-gray-400 dark:text-gray-500">Priority:</span>
        {(['high', 'medium', 'low'] as const).map(p => (
          <span key={p} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} /> {p}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-2"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> recurring</span>
      </div>

      {/* Transparent backdrop — closes expanded cell on outside click; transparent to drag events while dragging */}
      {expandedDate && (
        <div
          className={`fixed inset-0 z-10 ${draggingTaskId !== null ? 'pointer-events-none' : ''}`}
          onClick={() => setExpandedDate(null)}
        />
      )}

      {editingTask && (
        <TaskForm initial={editingTask} sections={sections} onSave={data => onUpdateTask(editingTask.id, data)} onClose={() => setEditingTask(null)} onCreateSection={onCreateSection} />
      )}
      {creatingForDate && (
        <TaskForm initial={{ deadline: creatingForDate, section_id: activeSectionFilter ?? undefined }} sections={sections} onSave={data => onCreateTask(data)} onClose={() => setCreatingForDate(null)} onCreateSection={onCreateSection} />
      )}
    </div>
  );
}

