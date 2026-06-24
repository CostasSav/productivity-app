import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTasksContext } from '../context/TasksContext';
import { useSections } from '../hooks/useSections';
import { usePomodoroSessions } from '../hooks/usePomodoroSessions';
import { useHabits } from '../hooks/useHabits';
import { useGratitude } from '../hooks/useGratitude';
import { useSleep } from '../hooks/useSleep';
import { useGrocery } from '../hooks/useGrocery';
import { PriorityBadge } from '../components/ui/Badge';
import { SectionBadge } from '../components/sections/SectionBadge';
import { Spinner } from '../components/ui/Spinner';
import { FloatingPaths } from '../components/ui/background-paths';
import ScrollExpandMedia from '../components/ui/scroll-expansion-hero';
import { isDue, localDateStr, logToLocalDate, calcCurrentStreak, getMonday, getWeekLogCount, weeklyCountRemaining } from '../utils/habitStats';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_FALLBACK = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' };

function isOverdue(task) {
  if (!task.deadline || task.status === 'done') return false;
  return task.deadline < new Date().toISOString().split('T')[0];
}

function formatDeadline(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Sleep helpers ─────────────────────────────────────────────────────────────

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function lastNDaysList(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

const SLEEP_MOON = ['🌑', '🌒', '🌓', '🌔', '🌕'];
const SLEEP_QUALITY_LABEL = ['Poor', 'Fair', 'Okay', 'Good', 'Great'];
const SLEEP_ENERGY_LABEL = ['Drained', 'Low', 'Okay', 'Good', 'Energised'];

function calcSleepDuration(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const bed = toMin(bedtime), wake = toMin(wakeTime);
  return wake >= bed ? wake - bed : (1440 - bed) + wake;
}

function formatSleepDuration(minutes) {
  if (minutes == null || minutes < 0) return null;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
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
    <div className={`relative flex items-start gap-3 p-4 rounded border transition-all duration-700
      ${overdue && !isDone ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-gray-200 bg-white dark:border-zinc-800/60 dark:bg-[#09090b]'}
      ${visibilityClass}`}>

      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg" style={{ backgroundColor: stripColor }} />

      <input
        type="checkbox"
        checked={isDone}
        onChange={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
        className="mt-1 w-4 h-4 accent-teal-600 cursor-pointer flex-shrink-0"
      />

      <div className="flex-1 min-w-0">
        <p className={`font-medium leading-snug ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          {task.title}
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <PriorityBadge priority={task.priority} />
          {section && <SectionBadge section={section} />}
          {task.deadline && (
            <span className={`text-xs font-medium font-mono tabular-nums ${overdue && !isDone ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
              {overdue && !isDone ? '⚠️ Overdue: ' : 'Due: '}{formatDeadline(task.deadline)}
            </span>
          )}
          {pomodoroCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1"
              title={`${pomodoroCount} total Pomodoro session${pomodoroCount !== 1 ? 's' : ''}${pomodoroTodayCount > 0 ? `, ${pomodoroTodayCount} today` : ''}`}>
              {'\u{1F345}'} {pomodoroCount}
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
                  className="h-full bg-teal-400 rounded-full transition-all"
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
                  className="w-3.5 h-3.5 accent-teal-600 cursor-pointer flex-shrink-0"
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
          className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] bg-teal-600 text-white text-xs rounded-full hover:bg-teal-700 font-medium flex-shrink-0 transition-colors shadow-sm"
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

function TodayHabitRow({ habit, todayLog, streak, weekCount, onLog, onUnlog }) {
  const unitLabel = habit.frequency === 'daily' ? 'day' : 'wk';
  const done = !!todayLog;

  const subtitle = () => {
    if (habit.frequency === 'weekly_count') {
      const remaining = (habit.targetCount ?? 1) - (weekCount ?? 0);
      if (done) return <span className="text-green-600 dark:text-green-400 font-medium">&#10003; Logged &mdash; {weekCount}/{habit.targetCount} this week</span>;
      return `${weekCount}/${habit.targetCount} this week – ${remaining} to go`;
    }
    if (done) return <span className="text-green-600 dark:text-green-400 font-medium">&#10003; Done today</span>;
    if (streak > 0) return `🔥 ${streak} ${unitLabel}${streak !== 1 ? 's' : ''}`;
    return 'Due today';
  };

  return (
    <div className="relative flex items-center gap-3 p-4 rounded border border-gray-200 bg-white dark:border-zinc-800/60 dark:bg-[#09090b]">
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg" style={{ backgroundColor: habit.color }} />
      <span className="text-xl leading-none flex-shrink-0">{habit.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`font-medium leading-snug ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          {habit.name}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle()}</p>
      </div>
      <button
        onClick={() => done ? onUnlog(todayLog.id) : onLog(habit.id)}
        title={done ? 'Mark incomplete' : 'Mark complete'}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 active:scale-95 ${
          done
            ? 'text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 hover:border-transparent'
        }`}
        style={done ? { backgroundColor: habit.color } : {}}
        onMouseEnter={e => { if (!done) e.currentTarget.style.backgroundColor = habit.color + '33'; }}
        onMouseLeave={e => { if (!done) e.currentTarget.style.backgroundColor = ''; }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    </div>
  );
}

// ── Sleep card ────────────────────────────────────────────────────────────────

function SleepSparkline({ entries }) {
  const days = lastNDaysList(7);
  const byDate = {};
  entries.forEach(e => { byDate[e.date] = e; });
  return (
    <div className="flex items-center gap-1" title="Last 7 nights">
      {days.map(date => {
        const e = byDate[date];
        const dur = e?.durationMinutes ?? null;
        const cls = dur == null ? 'bg-gray-200 dark:bg-zinc-700'
          : dur < 360 ? 'bg-red-400'
          : dur < 420 ? 'bg-amber-400'
          : 'bg-teal-400';
        return <div key={date} className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} title={dur != null ? formatSleepDuration(dur) : 'No entry'} />;
      })}
    </div>
  );
}

function TodaySleepCard({ entry, stats, allEntries, onSave, onNavigateSleep }) {
  const [bedtime, setBedtime] = useState('');
  const [wakeTime, setWakeTime] = useState('');
  const [quality, setQuality] = useState(null);
  const [energy, setEnergy] = useState(null);
  const [saving, setSaving] = useState(false);

  const duration = calcSleepDuration(bedtime, wakeTime);
  const canSave = bedtime && wakeTime && quality != null;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({
        date: yesterdayStr(),
        bedtime,
        wakeTime,
        quality,
        energy: energy ?? 3,
      });
    } finally {
      setSaving(false);
    }
  };

  const debtMin = stats?.currentSleepDebt ?? 0;
  const debtCls = debtMin === 0 ? 'text-teal-600 dark:text-teal-400'
    : debtMin < 60 ? 'text-teal-600 dark:text-teal-400'
    : debtMin < 120 ? 'text-amber-500 dark:text-amber-400'
    : 'text-red-500 dark:text-red-400';

  const MoonIcon = () => (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );

  if (entry) {
    return (
      <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded border border-gray-200 bg-white dark:border-zinc-800/60 dark:bg-[#09090b]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-400 dark:text-zinc-500">
            <MoonIcon />
            <span className="text-xs font-semibold uppercase tracking-wide">Last night</span>
          </div>
          {onNavigateSleep && (
            <button onClick={onNavigateSleep} className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline underline-offset-2 cursor-pointer flex-shrink-0">
              View details →
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
            {formatSleepDuration(entry.durationMinutes)}
          </span>
          <div className="flex flex-col gap-0.5">
            {entry.quality != null && (
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                {SLEEP_MOON[entry.quality - 1]} {SLEEP_QUALITY_LABEL[entry.quality - 1]}
              </span>
            )}
            {entry.energy != null && (
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                ⚡ {entry.energy} {SLEEP_ENERGY_LABEL[entry.energy - 1]}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium ${debtCls}`}>
            {debtMin === 0 ? 'No sleep debt ✓' : `Sleep debt: ${formatSleepDuration(debtMin)}`}
          </span>
          <SleepSparkline entries={allEntries} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 rounded border border-indigo-100 bg-indigo-50/40 dark:border-indigo-900/30 dark:bg-indigo-900/10">
      <div className="flex items-center gap-2">
        <MoonIcon />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Log last night's sleep</span>
        {duration != null && (
          <span className="ml-auto text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {formatSleepDuration(duration)}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-400 dark:text-zinc-500 mb-1">Bedtime</label>
          <input
            type="time"
            value={bedtime}
            onChange={e => setBedtime(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-400 dark:text-zinc-500 mb-1">Wake time</label>
          <input
            type="time"
            value={wakeTime}
            onChange={e => setWakeTime(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-zinc-500 w-14 flex-shrink-0">Quality</span>
        <div className="flex gap-1">
          {SLEEP_MOON.map((emoji, i) => {
            const val = i + 1;
            return (
              <button
                key={val}
                onClick={() => setQuality(quality === val ? null : val)}
                title={SLEEP_QUALITY_LABEL[i]}
                className={`text-base leading-none px-1 py-0.5 rounded transition-all cursor-pointer ${
                  quality === val ? 'bg-indigo-100 dark:bg-indigo-500/20 ring-1 ring-indigo-400 scale-110' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
        {quality != null && <span className="text-xs text-gray-400 dark:text-zinc-500 ml-1">{SLEEP_QUALITY_LABEL[quality - 1]}</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 dark:text-zinc-500 w-14 flex-shrink-0">Energy</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(val => (
            <button
              key={val}
              onClick={() => setEnergy(energy === val ? null : val)}
              className={`w-7 h-7 rounded text-xs font-semibold transition-all cursor-pointer ${
                energy === val
                  ? 'bg-indigo-500 text-white scale-110'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
        {energy != null && <span className="text-xs text-gray-400 dark:text-zinc-500 ml-1">{SLEEP_ENERGY_LABEL[energy - 1]}</span>}
      </div>

      <button
        onClick={handleSave}
        disabled={!canSave || saving}
        className={`w-full py-2 rounded text-sm font-medium transition-all ${
          canSave && !saving
            ? 'bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer'
            : 'bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed'
        }`}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export function Today({ onFocusTask, onNavigateGratitude, onNavigateGrocery, onNavigateSleep }) {
  const { tasks, loading, updateTask, toggleSubtask } = useTasksContext();
  const { sections } = useSections();
  const { totalByTaskId, todayByTaskId } = usePomodoroSessions();
  const { habits, logs: habitLogs, loading: habitsLoading, logHabit, unlogHabit } = useHabits();
  const { todayEntry: gratitudeEntry, settings: gratitudeSettings } = useGratitude();
  const { entriesMap: sleepEntriesMap, entries: sleepEntries, stats: sleepStats, loading: sleepLoading, saveSleep } = useSleep();
  const { items: groceryItems, loading: groceryLoading, addItem: addGroceryItemFn, addItemPending: groceryAdding } = useGrocery();
  const [fadingIds, setFadingIds] = useState(new Set());
  const [showToast, setShowToast] = useState(false);
  const toastTimerRef = useRef(null);
  const [groceryQuickAdd, setGroceryQuickAdd] = useState('');

  const sleepEntry = sleepLoading ? undefined : (sleepEntriesMap[yesterdayStr()] ?? null);
  const sleepAllEntries = sleepEntries.slice(0, 7);

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

  const isAfterReminderTime = useMemo(() => {
    if (!gratitudeSettings?.reminderTime) return false;
    const [h, m] = gratitudeSettings.reminderTime.split(':').map(Number);
    const now = new Date();
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m);
  }, [gratitudeSettings]);

  const todayStr = localDateStr();
  const todayDow = new Date().getDay();

  const logDatesByHabitId = new Map();
  const todayLogByHabitId = new Map();
  habitLogs.forEach(l => {
    const dateStr = logToLocalDate(l.completedAt);
    if (!logDatesByHabitId.has(l.habitId)) logDatesByHabitId.set(l.habitId, new Set());
    logDatesByHabitId.get(l.habitId).add(dateStr);
    if (dateStr === todayStr && !todayLogByHabitId.has(l.habitId)) {
      todayLogByHabitId.set(l.habitId, l);
    }
  });

  const habitsToday = habits.filter(h => {
    if (h.archivedAt) return false;
    if (h.frequency === 'weekly_count') {
      const logDates = logDatesByHabitId.get(h.id) ?? new Set();
      return weeklyCountRemaining(h, logDates) > 0;
    }
    return isDue(h, todayDow);
  });

  const activeHabitsToday = habitsToday.filter(h => !todayLogByHabitId.has(h.id));

  const suggestBucket = (t) => {
    if (t.deadline < todayStr) return 0;   // overdue
    if (t.deadline === todayStr) return 1; // today
    return 2;                               // future
  };

  const suggested = tasks
    .filter(t => (t.status !== 'done' || fadingIds.has(t.id)) && !t.pinnedToday && t.deadline)
    .sort((a, b) => {
      const ba = suggestBucket(a), bb = suggestBucket(b);
      if (ba !== bb) return ba - bb;
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (ba === 0) {
        // overdue: oldest deadline first, then priority
        if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
        return pa - pb;
      }
      // today + future: highest priority first, then soonest deadline
      if (pa !== pb) return pa - pb;
      return a.deadline < b.deadline ? -1 : 1;
    })
    .slice(0, 10);

  const focusList = tasks
    .filter(t => t.pinnedToday && (t.status !== 'done' || fadingIds.has(t.id)))
    .sort((a, b) => (isOverdue(a) ? 0 : 1) - (isOverdue(b) ? 0 : 1));

  const activeFocusCount = focusList.filter(t => t.status !== 'done').length;
  const activeSuggestedCount = suggested.filter(t => t.status !== 'done').length;
  const gratitudePending = gratitudeEntry === null;
  const isEmpty = focusList.length === 0 && suggested.length === 0 && habitsToday.length === 0
    && !loading && !habitsLoading && gratitudeEntry !== undefined && !gratitudePending;

  const handleGroceryQuickAdd = async (e) => {
    e.preventDefault();
    const name = groceryQuickAdd.trim();
    if (!name || groceryAdding) return;
    try {
      await addGroceryItemFn({ name });
      setGroceryQuickAdd('');
    } catch {
      // mutation handles cache rollback; ignore UI-level errors here
    }
  };

  const handleClearPins = async () => {
    const pinned = tasks.filter(t => t.pinnedToday);
    if (pinned.length === 0) return;
    if (!window.confirm(`Unpin all ${pinned.length} task${pinned.length !== 1 ? 's' : ''} from Today?`)) return;
    await Promise.all(pinned.map(t => updateTask(t.id, { pinnedToday: false })));
  };

  const countParts = [];
  if (activeFocusCount > 0) countParts.push(`${activeFocusCount} ${activeFocusCount === 1 ? 'task' : 'tasks'} in focus`);
  if (activeSuggestedCount > 0) countParts.push(`${activeSuggestedCount} suggested`);
  if (activeHabitsToday.length > 0) countParts.push(`${activeHabitsToday.length} ${activeHabitsToday.length === 1 ? 'habit' : 'habits'} due`);
  if (gratitudeEntry) countParts.push('gratitude ✓');
  else if (gratitudeEntry === null) countParts.push('gratitude pending');

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

  const sessionToast = (
    <div className={`fixed bottom-6 left-6 z-50 transition-all duration-500 ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
      <div className="flex items-center gap-2.5 bg-gray-900 text-white px-4 py-3 rounded shadow-xl text-sm font-medium">
        <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path fill="white" d="M9 9h2v6H9zm4 0h2v6h-2z" />
        </svg>
        Session complete! Take a 5-min break.
      </div>
    </div>
  );

  /* Full-screen scroll-expansion hero when today is clear */
  if (isEmpty) {
    return (
      <>
        <ScrollExpandMedia
          mediaType="image"
          mediaSrc="https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=1280&q=80"
          bgImageSrc="https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1920&q=80"
          title="All Clear"
          date={formatHeadingDate()}
          scrollToExpand="Scroll to expand"
        >
          <div className="max-w-xl mx-auto text-center space-y-5 py-8">
            <p className="text-6xl">&#x1F33F;</p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Nothing due today</h2>
            <p className="text-gray-500 dark:text-gray-400 leading-relaxed text-lg">
              Your slate is clean. Pin tasks from your task list to build a focus list, or enjoy the quiet.
            </p>
          </div>
        </ScrollExpandMedia>
        {sessionToast}
      </>
    );
  }

  /* Normal layout */
  return (
    <div className="max-w-2xl mx-auto px-1 py-8 space-y-8">

      {/* Animated hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-neutral-950 border border-gray-100 dark:border-gray-800">
        <div className="absolute inset-0 pointer-events-none">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
        <div className="relative z-10 flex items-start justify-between gap-4 px-6 py-8">
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white">{formatHeadingDate()}</h1>
            {countParts.length > 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{countParts.join(' · ')}</p>
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
      </div>

      {(loading || habitsLoading) && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && !habitsLoading && (
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

          {habitsToday.length > 0 && (
            <section>
              <SectionHeader title="Habits" count={activeHabitsToday.length} />
              <div className="space-y-2">
                {habitsToday.map(habit => {
                  const logDates = logDatesByHabitId.get(habit.id) ?? new Set();
                  const streak = calcCurrentStreak(habit, logDates);
                  const weekCount = habit.frequency === 'weekly_count'
                    ? getWeekLogCount(logDates, getMonday(new Date()))
                    : null;
                  return (
                    <TodayHabitRow
                      key={habit.id}
                      habit={habit}
                      todayLog={todayLogByHabitId.get(habit.id) ?? null}
                      streak={streak}
                      weekCount={weekCount}
                      onLog={logHabit}
                      onUnlog={unlogHabit}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {/* Sleep card */}
      {sleepEntry !== undefined && (
        <section>
          <TodaySleepCard
            entry={sleepEntry}
            stats={sleepStats}
            allEntries={sleepAllEntries}
            onSave={saveSleep}
            onNavigateSleep={onNavigateSleep}
          />
        </section>
      )}

      {/* Grocery card */}
      {!groceryLoading && (() => {
        const uncheckedCount = groceryItems.filter(i => !i.checked).length;
        const clear = groceryItems.length === 0;
        return (
          <section>
            <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded border border-gray-200 bg-white dark:border-zinc-800/60 dark:bg-[#09090b]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {clear ? (
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Grocery list is clear ✓</span>
                  ) : (
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} to buy
                    </span>
                  )}
                </div>
                {onNavigateGrocery && (
                  <button
                    onClick={onNavigateGrocery}
                    className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline underline-offset-2 transition-colors cursor-pointer flex-shrink-0"
                  >
                    Go to list →
                  </button>
                )}
              </div>
              <form onSubmit={handleGroceryQuickAdd} className="flex gap-2">
                <input
                  value={groceryQuickAdd}
                  onChange={e => setGroceryQuickAdd(e.target.value)}
                  placeholder="Quick add item..."
                  className="flex-1 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="submit"
                  disabled={!groceryQuickAdd.trim() || groceryAdding}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {groceryAdding ? '…' : 'Add'}
                </button>
              </form>
            </div>
          </section>
        );
      })()}

      {/* Gratitude card */}
      {gratitudeEntry !== undefined && (
        <section>
          {gratitudeEntry ? (
            <div className="flex items-center gap-3 px-4 py-3.5 rounded border border-teal-100 bg-teal-50 dark:border-teal-900/30 dark:bg-teal-900/10">
              <svg className="w-4 h-4 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-teal-700 dark:text-teal-400">Gratitude done</span>
              {gratitudeEntry.streak > 0 && (
                <span className="text-xs text-teal-600 dark:text-teal-500">
                  · {gratitudeEntry.streak} day streak 🔥
                </span>
              )}
            </div>
          ) : (
            <div className={`flex items-center justify-between px-4 py-3.5 rounded border transition-colors ${
              isAfterReminderTime
                ? 'border-teal-200 bg-teal-50 dark:border-teal-800/40 dark:bg-teal-900/10'
                : 'border-gray-200 bg-white dark:border-zinc-800/60 dark:bg-[#09090b]'
            }`}>
              <div className="flex items-center gap-2.5">
                {isAfterReminderTime && (
                  <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Evening gratitude 🌿</span>
                <span className="text-xs text-gray-400 dark:text-zinc-500">2 min</span>
              </div>
              {onNavigateGratitude && (
                <button
                  onClick={onNavigateGratitude}
                  className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline underline-offset-2 transition-colors cursor-pointer flex-shrink-0"
                >
                  Start ritual
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {sessionToast}
    </div>
  );
}
