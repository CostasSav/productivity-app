import { useState, useRef } from 'react';
import type { Task, Section } from '../../types';
import { TaskForm } from '../tasks/TaskForm';

// ── helpers ──────────────────────────────────────────────────────────────────

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const PRIORITY_COLOR: Record<string, string> = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' };
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offsetDay(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekOf(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const monday = offsetDay(dateStr, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => offsetDay(monday, i));
}

function formatHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

// ── component ─────────────────────────────────────────────────────────────────

interface CalendarDayViewProps {
  tasks: Task[];
  sections: Section[];
  onCreateTask: (data: Partial<Task>) => Promise<unknown>;
  onUpdateTask: (id: number, data: Partial<Task>) => Promise<unknown>;
  onCreateSection: (name: string, color: string) => Promise<Section>;
  filterSectionId?: number | null;
}

export function CalendarDayView({ tasks, sections, onCreateTask, onUpdateTask, onCreateSection, filterSectionId }: CalendarDayViewProps) {
  const today = localTodayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [creatingForDate, setCreatingForDate] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const swipeX = useRef(0);

  const weekDays = weekOf(selectedDate);
  const isToday = selectedDate === today;
  const isPast = selectedDate < today;

  // Tasks for the selected day, sorted high→medium→low then title
  const dayTasks = tasks
    .filter(t => {
      if (!t.deadline || t.status === 'done') return false;
      if (filterSectionId != null && t.section_id !== filterSectionId) return false;
      return t.deadline.split('T')[0] === selectedDate;
    })
    .sort((a, b) => {
      const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      return pd !== 0 ? pd : a.title.localeCompare(b.title);
    });

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Day header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 flex-shrink-0">
        <button
          onClick={() => setSelectedDate(d => offsetDay(d, -1))}
          aria-label="Previous day"
          className="w-11 h-11 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 active:bg-gray-200 dark:active:bg-zinc-700 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 text-center">
          <p className={`font-bold leading-tight text-lg ${
            isToday ? 'text-teal-600 dark:text-teal-400' :
            isPast ? 'text-gray-500 dark:text-gray-400' :
            'text-gray-900 dark:text-gray-100'
          }`}>
            {formatHeading(selectedDate)}
          </p>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-xs text-teal-500 dark:text-teal-400 hover:underline cursor-pointer mt-0.5"
            >
              Jump to today
            </button>
          )}
        </div>

        <button
          onClick={() => setSelectedDate(d => offsetDay(d, 1))}
          aria-label="Next day"
          className="w-11 h-11 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 active:bg-gray-200 dark:active:bg-zinc-700 transition-colors cursor-pointer flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ── 7-day week strip ───────────────────────────────────────── */}
      <div className="flex px-3 pb-3 gap-1 flex-shrink-0 border-b border-gray-100 dark:border-zinc-800/60">
        {weekDays.map(date => {
          const d = new Date(date + 'T00:00:00');
          const isSelected = date === selectedDate;
          const isTodayPill = date === today;
          const hasTasks = tasks.some(t => {
            if (!t.deadline || t.status === 'done') return false;
            if (filterSectionId != null && t.section_id !== filterSectionId) return false;
            return t.deadline.split('T')[0] === date;
          });

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors cursor-pointer active:scale-95
                ${isSelected
                  ? 'bg-teal-600 text-white'
                  : isTodayPill
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 active:bg-gray-200 dark:active:bg-zinc-700'}`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide">
                {DAY_INITIALS[d.getDay()]}
              </span>
              <span className="text-sm font-bold leading-none">{d.getDate()}</span>
              {/* task dot */}
              <span className={`w-1 h-1 rounded-full ${hasTasks ? (isSelected ? 'bg-white/70' : 'bg-teal-500 dark:bg-teal-400') : 'invisible'}`} />
            </button>
          );
        })}
      </div>

      {/* ── Event list (swipeable) ─────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-24"
        onTouchStart={e => { swipeX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          const delta = e.changedTouches[0].clientX - swipeX.current;
          if (Math.abs(delta) < 50) return;
          // swipe left = next day, swipe right = prev day
          setSelectedDate(d => offsetDay(d, delta < 0 ? 1 : -1));
        }}
      >
        {dayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg className="w-14 h-14 text-gray-200 dark:text-zinc-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Nothing scheduled {isToday ? 'for today' : 'for this day'}
            </p>
            <button
              onClick={() => setCreatingForDate(selectedDate)}
              className="mt-2 text-sm text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              + Add a task
            </button>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {dayTasks.map(task => {
              const section = sections.find(s => s.id === task.section_id) ?? null;
              const accent = section?.color ?? PRIORITY_COLOR[task.priority];
              const isOverdue = task.deadline! < today;

              return (
                <div
                  key={task.id}
                  className={`relative flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl border bg-white dark:bg-[#09090b] active:scale-[0.98] transition-transform cursor-pointer
                    ${isOverdue ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-zinc-800/60'}`}
                  onClick={() => setEditingTask(task)}
                >
                  {/* Colour accent bar */}
                  <div className="absolute left-0 inset-y-0 w-1 rounded-l-xl" style={{ backgroundColor: accent }} />

                  {/* Done button */}
                  <button
                    onClick={e => { e.stopPropagation(); onUpdateTask(task.id, { status: 'done' }); }}
                    aria-label="Mark as done"
                    className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center active:scale-90 transition-transform mt-0.5 hover:opacity-70"
                    style={{ borderColor: accent }}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">{task.title}</p>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                      <span className="text-xs font-medium" style={{ color: accent }}>
                        {PRIORITY_LABEL[task.priority]}
                      </span>

                      {section && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: section.color }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
                          {section.name}
                        </span>
                      )}

                      {isOverdue && (
                        <span className="text-xs text-red-500 dark:text-red-400 font-medium">Overdue</span>
                      )}

                      {task.recurrence && (
                        <svg className="w-3 h-3 text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => setCreatingForDate(selectedDate)}
        aria-label={`Add task for ${formatHeading(selectedDate)}`}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* ── Modals ── */}
      {editingTask && (
        <TaskForm
          initial={editingTask} sections={sections}
          onSave={data => onUpdateTask(editingTask.id, data)}
          onClose={() => setEditingTask(null)}
          onCreateSection={onCreateSection}
        />
      )}
      {creatingForDate && (
        <TaskForm
          initial={{ deadline: creatingForDate }}
          sections={sections}
          onSave={data => onCreateTask(data)}
          onClose={() => setCreatingForDate(null)}
          onCreateSection={onCreateSection}
        />
      )}
    </div>
  );
}
