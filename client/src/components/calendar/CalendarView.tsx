import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [edgeHint, setEdgeHint] = useState<'left' | 'right' | null>(null);
  const [showBacklog, setShowBacklog] = useState(false);

  const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = draggingTaskId !== null;

  // Escape: close overlay + clear selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpandedDate(null);
        setSelectedTaskIds(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Clear edge timer on unmount
  useEffect(() => () => {
    if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
  }, []);

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

  // Backlog: tasks without a deadline, respecting the active section filter
  const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const backlogTasks = tasks.filter(t => {
    if (t.deadline || t.status === 'done') return false;
    if (activeSectionFilter != null && t.section_id !== activeSectionFilter) return false;
    return true;
  });

  const backlogGroups: Array<{ key: string | number; name: string; color: string | null; tasks: Task[] }> = [];
  const backlogBySection: Record<string | number, Task[]> = {};
  for (const t of backlogTasks) {
    const key = t.section_id ?? 'none';
    if (!backlogBySection[key]) backlogBySection[key] = [];
    backlogBySection[key].push(t);
  }
  for (const s of sections) {
    if (backlogBySection[s.id]) {
      backlogGroups.push({ key: s.id, name: s.name, color: s.color, tasks: [...backlogBySection[s.id]].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)) });
    }
  }
  if (backlogBySection['none']) {
    backlogGroups.push({ key: 'none', name: 'Unassigned', color: null, tasks: [...backlogBySection['none']].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)) });
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

  const clearEdgeTimer = () => {
    if (edgeTimerRef.current) { clearTimeout(edgeTimerRef.current); edgeTimerRef.current = null; }
    setEdgeHint(null);
  };

  const handleGridDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ZONE = 72;

    if (x < ZONE) {
      setEdgeHint('left');
      if (!edgeTimerRef.current) {
        edgeTimerRef.current = setTimeout(() => {
          prevMonth();
          edgeTimerRef.current = null;
          setEdgeHint(null);
        }, 700);
      }
    } else if (x > rect.width - ZONE) {
      setEdgeHint('right');
      if (!edgeTimerRef.current) {
        edgeTimerRef.current = setTimeout(() => {
          nextMonth();
          edgeTimerRef.current = null;
          setEdgeHint(null);
        }, 700);
      }
    } else {
      clearEdgeTimer();
    }
  };

  const toggleSelect = useCallback((id: number) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Shared drag-start logic for both calendar pills and expanded overlay
  const startDrag = (e: React.DragEvent, task: Task) => {
    const idsToMove = selectedTaskIds.has(task.id)
      ? [...selectedTaskIds]
      : [task.id];
    e.dataTransfer.setData('taskIds', JSON.stringify(idsToMove));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(task.id);
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    clearEdgeTimer();
    const raw = e.dataTransfer.getData('taskIds');
    const ids: number[] = raw
      ? JSON.parse(raw)
      : [Number(e.dataTransfer.getData('taskId'))].filter(Boolean);
    ids.forEach(id => onUpdateTask(id, { deadline: dateStr }));
    setDraggingTaskId(null);
    setSelectedTaskIds(new Set());
  };

  // Task pill — shared between calendar cells and expanded overlay
  const renderTaskPill = (task: Task, inOverlay = false) => {
    const isSelected = selectedTaskIds.has(task.id);
    const isBeingDragged = draggingTaskId === task.id;

    if (inOverlay) {
      return (
        <div
          key={task.id}
          draggable
          onDragStart={e => { startDrag(e, task); }}
          onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); setExpandedDate(null); clearEdgeTimer(); }}
          onClick={e => {
            if (e.shiftKey) { e.stopPropagation(); toggleSelect(task.id); }
          }}
          className={`group/row flex items-center gap-1.5 px-1.5 py-1 rounded cursor-grab active:cursor-grabbing transition-opacity
            ${isBeingDragged ? 'opacity-40' : ''}
            ${isSelected ? 'ring-1 ring-teal-400 bg-teal-50/50 dark:bg-teal-900/20' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
        >
          <button
            onClick={e => { e.stopPropagation(); onUpdateTask(task.id, { status: 'done' }); }}
            title="Mark as done"
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 border flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
            style={{ borderColor: PRIORITY_HEX[task.priority] }}
          >
            <svg className="w-2 h-2 opacity-0 group-hover/row:opacity-100 transition-opacity" style={{ color: PRIORITY_HEX[task.priority] }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 12 12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6l3 3 5.5-5" />
            </svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); setExpandedDate(null); setEditingTask(task); }}
            className="flex-1 text-left text-xs text-gray-700 dark:text-gray-200 truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
          >
            {task.title}
          </button>
          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />}
          {!isSelected && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />}
        </div>
      );
    }

    return (
      <div
        key={task.id}
        draggable
        onDragStart={e => { e.stopPropagation(); startDrag(e, task); }}
        onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); clearEdgeTimer(); }}
        onClick={e => {
          e.stopPropagation();
          if (e.shiftKey) {
            toggleSelect(task.id);
          } else {
            setSelectedTaskIds(new Set());
            setEditingTask(task);
          }
        }}
        className={`group flex items-center gap-1 px-1 py-0.5 rounded text-xs cursor-grab active:cursor-grabbing transition-opacity
          ${isBeingDragged ? 'opacity-40' : ''}
          ${isSelected ? 'ring-1 ring-teal-400' : ''}
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
          <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: PRIORITY_HEX[task.priority] }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 12 12">
            <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6l3 3 5.5-5" />
          </svg>
        </button>
        <span className="truncate">{task.title}</span>
        {task.recurrence && <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
      </div>
    );
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{MONTHS[month]} {year}</h1>
          <button onClick={goToday} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">Today</button>
          {selectedTaskIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 px-2.5 py-1 rounded-full font-medium">
                {selectedTaskIds.size} selected
              </span>
              <button
                onClick={() => setSelectedTaskIds(new Set())}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1">
            <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <button
            onClick={() => setShowBacklog(b => !b)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors cursor-pointer ${
              showBacklog
                ? 'bg-gray-700 text-white border-gray-700 dark:bg-gray-200 dark:text-gray-800 dark:border-gray-200'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            Backlog
            {backlogTasks.length > 0 && (
              <span className="ml-0.5 bg-teal-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {backlogTasks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Section filter chips */}
      {filterSectionId === undefined && sections.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button onClick={() => setSectionFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sectionFilter === 'all' ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700'}`}>
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

      {/* Calendar + Backlog row */}
      <div className="flex-1 flex gap-3 min-h-0">
      <div className="flex-1 flex flex-col min-h-0">

      {/* Calendar grid */}
      <div className="flex-1 flex flex-col">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-xs font-semibold text-gray-400 dark:text-gray-500 text-center py-2">{d}</div>
          ))}
        </div>

        {/* Grid with edge-detection for month navigation */}
        <div
          className="flex-1 grid gap-1 relative"
          style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}
          onDragOver={handleGridDragOver}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) clearEdgeTimer(); }}
        >
          {/* Left edge: drag here → previous month */}
          <div className={`absolute left-0 inset-y-0 w-16 z-10 pointer-events-none flex items-center justify-start pl-1 transition-opacity duration-150 ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
            <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${edgeHint === 'left' ? 'bg-teal-500 text-white shadow-lg scale-110' : 'bg-teal-100/80 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </div>
          </div>

          {/* Right edge: drag here → next month */}
          <div className={`absolute right-0 inset-y-0 w-16 z-10 pointer-events-none flex items-center justify-end pr-1 transition-opacity duration-150 ${isDragging ? 'opacity-100' : 'opacity-0'}`}>
            <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${edgeHint === 'right' ? 'bg-teal-500 text-white shadow-lg scale-110' : 'bg-teal-100/80 text-teal-700 dark:bg-teal-900/50 dark:text-teal-400'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>

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
                    onClick={() => { if (!isExpanded) { setSelectedTaskIds(new Set()); setCreatingForDate(dateStr); } }}
                    onDragOver={e => { e.preventDefault(); setDragOverDate(dateStr); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
                    onDrop={e => handleDrop(e, dateStr)}
                  >
                    <span className={`text-xs font-semibold font-mono w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${isToday && !isDragOver ? 'bg-teal-600 text-white' : isPast ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                      {parseInt(dateStr.split('-')[2], 10)}
                    </span>
                    <div className="flex-1 space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 3).map(task => renderTaskPill(task, false))}
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
                        <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 dark:border-zinc-800/60 flex-shrink-0">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <button onClick={() => setExpandedDate(null)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 dark:text-gray-500 cursor-pointer">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-1 space-y-0.5">
                          {dayTasks.map(task => renderTaskPill(task, true))}
                        </div>
                        <div className="border-t border-gray-200 dark:border-zinc-800/60 px-1.5 py-1 flex-shrink-0">
                          <button
                            onClick={() => { setExpandedDate(null); setCreatingForDate(dateStr); }}
                            className="flex items-center gap-1 w-full px-1.5 py-1 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
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
      <div className="flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-zinc-800/60 mt-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500">Priority:</span>
        {(['high', 'medium', 'low'] as const).map(p => (
          <span key={p} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} /> {p}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 ml-2">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          recurring
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">Shift+click to select · drag to edge to change month</span>
      </div>

      </div>{/* end calendar column */}

      {/* Backlog panel */}
      {showBacklog && (
        <div className="w-60 flex-shrink-0 flex flex-col border border-gray-200 dark:border-zinc-700/60 rounded-lg bg-white dark:bg-[#09090b] overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-zinc-700/60 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Backlog</span>
              {backlogTasks.length > 0 && (
                <span className="text-xs bg-teal-500/15 text-teal-600 dark:text-teal-400 rounded-full px-2 py-0.5 font-semibold">{backlogTasks.length}</span>
              )}
            </div>
            <button onClick={() => setShowBacklog(false)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 cursor-pointer transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {backlogTasks.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">No unscheduled tasks</p>
            ) : (
              backlogGroups.map(group => (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {group.color
                      ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                      : <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-zinc-600 flex-shrink-0" />}
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest truncate">{group.name}</span>
                  </div>
                  <div className="space-y-0.5">
                    {group.tasks.map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('taskIds', JSON.stringify([task.id]));
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingTaskId(task.id);
                        }}
                        onDragEnd={() => { setDraggingTaskId(null); setDragOverDate(null); }}
                        className={`group/bl flex items-center gap-1.5 px-1.5 py-1.5 rounded transition-colors cursor-grab active:cursor-grabbing ${
                          draggingTaskId === task.id ? 'opacity-40' : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <button
                          onClick={e => { e.stopPropagation(); onUpdateTask(task.id, { status: 'done' }); }}
                          title="Mark as done"
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 border flex items-center justify-center hover:scale-110 transition-transform cursor-pointer"
                          style={{ borderColor: PRIORITY_HEX[task.priority] }}
                        >
                          <svg className="w-2 h-2 opacity-0 group-hover/bl:opacity-100 transition-opacity" style={{ color: PRIORITY_HEX[task.priority] }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 12 12">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 6l3 3 5.5-5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEditingTask(task)}
                          className="flex-1 text-left text-xs text-gray-700 dark:text-gray-200 truncate hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
                        >
                          {task.title}
                        </button>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority]}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {backlogTasks.length > 0 && (
            <div className="border-t border-gray-200 dark:border-zinc-700/60 px-3 py-2 flex-shrink-0">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Drag a task onto a date to schedule it</p>
            </div>
          )}
        </div>
      )}

      </div>{/* end calendar+backlog row */}

      {/* Transparent backdrop — closes expanded cell; passthrough during drag */}
      {expandedDate && (
        <div
          className={`fixed inset-0 z-10 ${isDragging ? 'pointer-events-none' : ''}`}
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
