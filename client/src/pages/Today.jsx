import { useState, useEffect, useRef, useCallback } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useSections } from '../hooks/useSections';
import { usePomodoroSessions } from '../hooks/usePomodoroSessions';
import { PriorityBadge } from '../components/ui/Badge';
import { SectionBadge } from '../components/sections/SectionBadge';
import { Spinner } from '../components/ui/Spinner';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_FALLBACK = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' };

function isOverdue(task) {
  if (!task.deadline || task.status === 'done') return false;
  return task.deadline < new Date().toISOString().split('T')[0];
}

function formatDeadline(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatHeadingDate() {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return `${weekday}, ${monthDay}`;
}

function TodayTaskCard({ task, sections, onUpdate, onFocusTask, onToggleSubtask, pomodoroCount, pomodoroTodayCount, fading }) {
  const section = sections.find(s => s.id === task.section_id) ?? null;
  const overdue = isOverdue(task);
  const isDone = task.status === 'done';
  const doneCount = task.subtasks.filter(s => s.status === 'done').length;
  const totalCount = task.subtasks.length;
  const stripColor = section?.color ?? PRIORITY_FALLBACK[task.priority];

  const visibilityClass = fading
    ? 'opacity-0 -translate-y-1 pointer-events-none'
    : isDone
    ? 'opacity-50'
    : 'opacity-100';

  return (
    <div className={`relative flex items-start gap-3 p-4 rounded-lg border transition-all duration-700
      ${overdue && !isDone ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}
      ${visibilityClass}`}>

      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg" style={{ backgroundColor: stripColor }} />

      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
        className="mt-1 w-4 h-4 accent-indigo-600 cursor-pointer flex-shrink-0"
      />

      <div className="flex-1 min-w-0">
        <p className={`font-medium leading-snug ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          {task.title}
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <PriorityBadge priority={task.priority} />
          {section && <SectionBadge section={section} />}
          {task.deadline && (
            <span className={`text-xs font-medium ${overdue && !isDone ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {overdue && !isDone ? '⚠ Overdue: ' : 'Due: '}{formatDeadline(task.deadline)}
            </span>
          )}
          {pomodoroCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1"
              title={`${pomodoroCount} total Pomodoro session${pomodoroCount !== 1 ? 's' : ''}${pomodoroTodayCount > 0 ? `, ${pomodoroTodayCount} today` : ''}`}>
              🍅 {pomodoroCount}
              {pomodoroTodayCount > 0 && (
                <span className="text-gray-300 dark:text-gray-600">({pomodoroTodayCount} today)</span>
              )}
            </span>
          )}
        </div>

        {totalCount > 0 && (
          <div className="mt-2.5 pl-2 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all"
                  style={{ width: `${(doneCount / totalCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{doneCount}/{totalCount}</span>
            </div>
            {task.subtasks.map(sub => (
              <div key={sub.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sub.status === 'done'}
                  onChange={e => onToggleSubtask(task.id, sub.id, e.target.checked)}
                  className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer flex-shrink-0"
                />
                <span className={`text-xs ${sub.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                  {sub.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isDone && onFocusTask && (
        <button
          onClick={() => onFocusTask(task)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-full hover:bg-indigo-700 font-medium flex-shrink-0 transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Focus
        </button>
      )}
    </div>
  );
}

function SectionHeader({ title, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</h2>
      {count > 0 && (
        <span className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">{count}</span>
      )}
    </div>
  );
}

export function Today({ onFocusTask }) {
  const { tasks, loading, updateTask, toggleSubtask } = useTasks();
  const { sections } = useSections();
  const { totalByTaskId, todayByTaskId } = usePomodoroSessions();
  const [fadingIds, setFadingIds] = useState(new Set());
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef(null);

  const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    const handler = () => {
      setShowToast(true);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 3500);
    };
    window.addEventListener('pomodoro-session-complete', handler);
    return () => {
      window.removeEventListener('pomodoro-session-complete', handler);
      clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleUpdate = useCallback(async (id, data) => {
    const result = await updateTask(id, data);
    if (data.status === 'done') {
      setFadingIds(prev => new Set([...prev, id]));
      setTimeout(() => {
        setFadingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      }, 2000);
    } else if (data.status === 'todo') {
      setFadingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
    return result;
  }, [updateTask]);

  const suggested = tasks
    .filter(t => (t.status !== 'done' || fadingIds.has(t.id)) && !t.pinnedToday && t.deadline && t.deadline <= in3Days)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return a.deadline < b.deadline ? -1 : 1;
    })
    .slice(0, 10);

  const focusList = tasks.filter(t => t.pinnedToday && (t.status !== 'done' || fadingIds.has(t.id)));

  const activeFocusCount = focusList.filter(t => t.status !== 'done').length;
  const activeSuggestedCount = suggested.filter(t => t.status !== 'done').length;
  const isEmpty = focusList.length === 0 && suggested.length === 0 && !loading;

  const handleClearPins = async () => {
    const pinned = tasks.filter(t => t.pinnedToday);
    if (pinned.length === 0) return;
    if (!window.confirm(`Unpin all ${pinned.length} task${pinned.length !== 1 ? 's' : ''} from Today?`)) return;
    await Promise.all(pinned.map(t => updateTask(t.id, { pinnedToday: false })));
  };

  const countParts = [];
  if (activeFocusCount > 0) countParts.push(`${activeFocusCount} ${activeFocusCount === 1 ? 'task' : 'tasks'} in focus`);
  if (activeSuggestedCount > 0) countParts.push(`${activeSuggestedCount} suggested`);

  const cardProps = task => ({
    task,
    sections,
    onUpdate: handleUpdate,
    onFocusTask,
    onToggleSubtask: toggleSubtask,
    pomodoroCount: totalByTaskId[task.id] ?? 0,
    pomodoroTodayCount: todayByTaskId[task.id] ?? 0,
    fading: fadingIds.has(task.id),
  });

  return (
    <div className="max-w-2xl mx-auto px-1 py-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{formatHeadingDate()}</h1>
          {countParts.length > 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{countParts.join(' · ')}</p>
          )}
        </div>
        {tasks.some(t => t.pinnedToday) && (
          <button
            onClick={handleClearPins}
            className="flex-shrink-0 mt-1 text-xs text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Unpin all tasks from Today"
          >
            Clear all pins
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {isEmpty && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-4">🌿</p>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">Nothing due soon.</p>
          <p className="text-sm mt-1">Pin tasks to build your focus list.</p>
        </div>
      )}

      {!loading && !isEmpty && (
        <>
          {focusList.length > 0 && (
            <section>
              <SectionHeader title="My Focus List" count={activeFocusCount} />
              <div className="space-y-2">
                {focusList.map(task => (
                  <TodayTaskCard key={task.id} {...cardProps(task)} />
                ))}
              </div>
            </section>
          )}

          {suggested.length > 0 && (
            <section>
              <SectionHeader title="Suggested" count={activeSuggestedCount} />
              <div className="space-y-2">
                {suggested.map(task => (
                  <TodayTaskCard key={task.id} {...cardProps(task)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Session complete toast */}
      <div className={`fixed bottom-6 left-6 z-50 transition-all duration-500 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <div className="flex items-center gap-2.5 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium">
          <span className="text-base">🍅</span>
          Session complete! Take a 5-min break.
        </div>
      </div>
    </div>
  );
}
