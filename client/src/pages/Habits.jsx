import { useState, useRef, useCallback } from 'react';
import { useHabits } from '../hooks/useHabits';
import { useSections } from '../hooks/useSections';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { SectionSelector } from '../components/sections/SectionSelector';
import { api } from '../api';
import {
  localDateStr, logToLocalDate, getLast7Days, getLast28Days,
  isDue, isWeekFullyComplete, calcCurrentStreak, calcLongestStreak, calcRate30,
  getMonday, getWeekLogCount, weeklyCountRemaining,
} from '../utils/habitStats';

// â"€â"€ Constants â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const EMOJIS = ['\u{1F4A7}','\u{1F3C3}\u{200D}\u{2642}\u{FE0F}','\u{1F4DA}','\u{1F9D8}\u{200D}\u{2640}\u{FE0F}','\u{1F4AA}','\u{1F957}','\u{1F634}','\u{270D}\u{FE0F}','\u{1F3AF}','\u{1F9F9}','\u{1F48A}','\u{1F6B4}','\u{1F3B6}','\u{1F9E0}','\u{1F3A8}','\u{1F3B8}','\u{1F33F}','\u{2600}\u{FE0F}','\u{1F6B6}','\u{1F4A4}'];
const PALETTE = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#64748b'];
const WEEK_DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const inputCls = 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-500';
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

// â"€â"€ StatsPanel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function StatsPanel({ habit, logDates }) {
  const today = localDateStr();
  const current = calcCurrentStreak(habit, logDates);
  const longest = calcLongestStreak(habit, logDates);
  const total = logDates.size;
  const rate = calcRate30(habit, logDates);
  const unitLabel = habit.frequency === 'daily' ? 'day' : 'wk';

  const last28 = getLast28Days();
  const heatmapRows = [
    last28.slice(0, 7),
    last28.slice(7, 14),
    last28.slice(14, 21),
    last28.slice(21, 28),
  ];
  const colLabels = last28.slice(0, 7).map(d => DAY_LABELS[d.dow]);

  const statCell = (label, value) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2.5">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold font-mono text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {statCell(
          'Current streak',
          current > 0 ? `🔥 ${current} ${unitLabel}${current !== 1 ? 's' : ''}` : '—',
        )}
        {statCell(
          'Longest streak',
          longest > 0 ? `${longest} ${unitLabel}${longest !== 1 ? 's' : ''}` : '—',
        )}
        {statCell('Total completions', total > 0 ? total : '—')}
        {statCell('Last 30 days', rate !== null ? `${rate}%` : '—')}
      </div>

      <div>
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {colLabels.map((lbl, i) => (
            <div key={i} className="text-center text-[10px] text-gray-300 dark:text-gray-600 leading-none">
              {lbl}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {heatmapRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7 gap-1">
              {row.map(({ dateStr, dow }) => {
                const completed = logDates.has(dateStr);
                const due = isDue(habit, dow); // weekly_count always returns true
                const isToday = dateStr === today;
                const cellStyle = {
                  ...(completed ? { backgroundColor: habit.color + 'cc' } : {}),
                  ...(isToday ? { outline: `2px solid ${habit.color}`, outlineOffset: '2px' } : {}),
                };
                const cellClass = completed
                  ? 'rounded-sm'
                  : due
                    ? 'rounded-sm bg-gray-100 dark:bg-gray-700'
                    : 'rounded-sm bg-gray-50 dark:bg-gray-700/30 opacity-40';
                return (
                  <div key={dateStr} className={`h-4 ${cellClass}`} style={cellStyle} title={dateStr} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// â"€â"€ HabitForm â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function HabitForm({ initial, sections, onCreateSection, onSave, onArchive, onClose }) {
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? EMOJIS[0]);
  const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
  const [frequency, setFrequency] = useState(initial?.frequency ?? 'daily');
  const [targetDays, setTargetDays] = useState(initial?.targetDays ?? []);
  const [targetCount, setTargetCount] = useState(initial?.targetCount ?? 4);
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const toggleDay = val =>
    setTargetDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]);

  const handleFrequencyChange = f => {
    setFrequency(f);
    if (f === 'weekly' && targetDays.length === 0) setTargetDays([new Date().getDay()]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (frequency === 'weekly' && targetDays.length === 0) {
      setError('Select at least one day for a weekly habit'); return;
    }
    setSaving(true); setError(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        icon, color, frequency,
        targetDays: frequency === 'weekly' ? targetDays : [],
        targetCount: frequency === 'weekly_count' ? targetCount : null,
        sectionId,
      });
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await onArchive();
      onClose();
    } catch (e) {
      setError(e.message);
      setArchiving(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Modal
      title={isEdit ? 'Edit Habit' : 'New Habit'}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 dark:text-red-400">Archive this habit?</span>
                <button
                  onClick={handleArchive} disabled={archiving}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {archiving ? 'Archiving…' : 'Yes, archive'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
              >
                Archive habit
              </button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
              Cancel
            </button>
            <button
              onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div>
          <label className={labelCls}>Name *</label>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            className={inputCls} placeholder="e.g. Drink water, Read 20 pages…"
          />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Optional notes…" />
        </div>

        <div>
          <label className={labelCls}>Icon</label>
          <div className="grid grid-cols-10 gap-1 p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setIcon(e)}
                className={`text-xl p-1.5 rounded transition-colors leading-none ${icon === e ? 'bg-white dark:bg-gray-600 ring-2 ring-teal-500 shadow-sm' : 'hover:bg-white dark:hover:bg-gray-600'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Color</label>
          <div className="flex gap-2.5 flex-wrap">
            {PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800 scale-110' : 'hover:scale-105'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Frequency</label>
          <div className="flex gap-2">
            {[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Set days' },
              { value: 'weekly_count', label: '× per week' },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => handleFrequencyChange(value)}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${frequency === value ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {frequency === 'weekly' && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Repeat on</p>
              <div className="flex gap-1.5 flex-wrap">
                {WEEK_DAYS.map(({ label, value }) => (
                  <button key={value} type="button" onClick={() => toggleDay(value)}
                    className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${targetDays.includes(value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {frequency === 'weekly_count' && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Minimum sessions per week</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTargetCount(c => Math.max(1, c - 1))}
                  className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-lg leading-none hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >−</button>
                <span className="text-xl font-semibold w-6 text-center text-gray-800 dark:text-gray-100">{targetCount}</span>
                <button
                  type="button"
                  onClick={() => setTargetCount(c => Math.min(7, c + 1))}
                  className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-lg leading-none hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >+</button>
                <span className="text-sm text-gray-400 dark:text-gray-500">× per week</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Section</label>
          <SectionSelector sections={sections} value={sectionId} onChange={setSectionId} onCreateSection={onCreateSection} />
        </div>
      </div>
    </Modal>
  );
}

// â"€â"€ HabitCard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function HabitCard({
  habit, logs, onLog, onUnlog, onEdit,
  onDragStart, onDragOver, onDrop, onDragEnd,
  isDragging, isDragOver,
}) {
  const [expanded, setExpanded] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const wasDragging = useRef(false);
  const today = localDateStr();
  const last7 = getLast7Days();

  const logsByDate = new Map();
  const logDates = new Set();
  logs
    .filter(l => l.habitId === habit.id)
    .forEach(l => {
      const d = logToLocalDate(l.completedAt);
      logDates.add(d);
      if (!logsByDate.has(d)) logsByDate.set(d, l);
    });

  const todayLog = logsByDate.get(today) ?? null;
  const streak = calcCurrentStreak(habit, logDates);
  const unitLabel = habit.frequency === 'daily' ? 'day' : 'wk';
  const weekCount = habit.frequency === 'weekly_count'
    ? getWeekLogCount(logDates, getMonday(new Date()))
    : null;

  const handleCheck = (e) => {
    e.stopPropagation();
    if (!todayLog) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 550);
      onLog(habit.id);
    } else {
      onUnlog(todayLog.id);
    }
  };

  return (
    <div
      draggable
      onDragStart={() => { wasDragging.current = true; onDragStart(habit.id); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(habit.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(habit.id); }}
      onDragEnd={() => { onDragEnd(); setTimeout(() => { wasDragging.current = false; }, 50); }}
      onClick={() => { if (!wasDragging.current) setExpanded(e => !e); }}
      className={`bg-white dark:bg-gray-800 rounded border flex flex-col gap-4 p-5 cursor-pointer select-none transition-all duration-200
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isDragOver ? 'ring-2 ring-teal-400 border-teal-300' : 'border-gray-200 dark:border-gray-700 hover:shadow-md'}
      `}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* drag handle */}
        <div className="flex-shrink-0 mt-1 cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500"
          title="Drag to reorder" onMouseDown={e => e.stopPropagation()}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zM7 8a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0V9a1 1 0 00-1-1zm-6 6a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm6 0a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" />
          </svg>
        </div>

        <span className="text-2xl leading-none mt-0.5 flex-shrink-0">{habit.icon}</span>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug truncate">{habit.name}</h3>
          {habit.frequency === 'weekly_count' ? (
            <p className="text-xs font-medium mt-0.5">
              {streak > 0
                ? <span className="text-orange-500">🔥 {streak} wk{streak !== 1 ? 's' : ''} &nbsp;</span>
                : null}
              <span className={weekCount >= habit.targetCount ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}>
                {weekCount}/{habit.targetCount} this week
              </span>
            </p>
          ) : streak > 0 ? (
            <p className="text-xs font-medium text-orange-500 mt-0.5">🔥 {streak} {unitLabel}{streak !== 1 ? 's' : ''}</p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">No streak yet</p>
          )}
        </div>

        <button
          onClick={e => { e.stopPropagation(); onEdit(habit); }}
          title="Edit habit"
          className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        <svg
          className={`flex-shrink-0 w-4 h-4 text-gray-300 dark:text-gray-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Last 7 days */}
      <div className="flex justify-between px-1">
        {last7.map(({ dateStr, dow }) => {
          const completed = logsByDate.has(dateStr);
          const due = isDue(habit, dow);
          const isToday = dateStr === today;
          let circleClass = '';
          let circleStyle = {};
          const alwaysDue = habit.frequency === 'daily' || habit.frequency === 'weekly_count';
          if (completed) { circleStyle = { backgroundColor: habit.color }; }
          else if (!due && !alwaysDue) { circleClass = 'bg-gray-100 dark:bg-gray-700/40 opacity-40'; }
          else if (isToday) { circleClass = 'border-2 bg-transparent'; circleStyle = { borderColor: habit.color }; }
          else { circleClass = 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600'; }
          return (
            <div key={dateStr} className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full transition-colors ${circleClass}`} style={circleStyle} />
              <span className={`text-xs ${isToday ? 'font-semibold text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                {DAY_LABELS[dow]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Check button with confetti burst */}
      <div className="flex justify-center" onClick={e => e.stopPropagation()}>
        <div className="relative inline-flex items-center justify-center">
          {celebrating && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden>
              {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                <span
                  key={i}
                  className="confetti-particle"
                  style={{ '--angle': `${angle}deg`, '--color': PALETTE[i % PALETTE.length] }}
                />
              ))}
            </div>
          )}
          <button
            onClick={handleCheck}
            title={todayLog ? 'Mark incomplete' : 'Mark complete'}
            className={`w-[52px] h-[52px] rounded-full flex items-center justify-center transition-colors duration-150
              ${celebrating ? 'animate-habit-pop' : ''}
              ${todayLog ? 'text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600'}
            `}
            style={todayLog ? { backgroundColor: habit.color } : {}}
            onMouseEnter={e => { if (!todayLog) e.currentTarget.style.backgroundColor = habit.color + '22'; }}
            onMouseLeave={e => { if (!todayLog) e.currentTarget.style.backgroundColor = ''; }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && <StatsPanel habit={habit} logDates={logDates} />}
    </div>
  );
}

// â"€â"€ ArchivedHabitCard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function ArchivedHabitCard({ habit, onRestore }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3 opacity-50 hover:opacity-70 transition-opacity">
      <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: habit.color }} />
      <span className="text-2xl leading-none flex-shrink-0">{habit.icon}</span>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-500 dark:text-gray-400 truncate line-through">{habit.name}</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Archived</p>
      </div>
      <button
        onClick={() => onRestore(habit.id)}
        className="flex-shrink-0 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-500 dark:text-gray-400 hover:text-teal-600 hover:border-teal-500 dark:hover:text-teal-400 dark:hover:border-teal-500 transition-colors"
      >
        Restore
      </button>
    </div>
  );
}

// â"€â"€ Empty state â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function HabitsEmptyState({ onCreate }) {
  return (
    <div className="text-center py-16">
      <svg viewBox="0 0 80 80" className="w-20 h-20 mx-auto mb-6" fill="none" aria-hidden>
        <rect x="8" y="8" width="64" height="64" rx="4" stroke="#e2e8f0" strokeWidth="3" className="dark:stroke-gray-600" />
        <line x1="20" y1="32" x2="60" y2="32" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-gray-600" />
        <line x1="20" y1="48" x2="60" y2="48" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-gray-600" />
        <circle cx="40" cy="40" r="12" stroke="#14b8a6" strokeWidth="3" />
        <path d="M34 40l4 4 8-8" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">Build your first habit</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto">
        Track daily and weekly habits, build streaks, and watch your consistency grow.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create your first habit
      </button>
    </div>
  );
}

// â"€â"€ Habits page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export function Habits() {
  const { habits, logs, loading, createHabit, updateHabit, archiveHabit, reorderHabits, logHabit, unlogHabit, reload } = useHabits();
  const { sections, createSection } = useSections();
  const [formTarget, setFormTarget] = useState(null);

  // Drag-and-drop state
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Archive view state
  const [showArchived, setShowArchived] = useState(false);
  const [archivedHabits, setArchivedHabits] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const isFormOpen = formTarget !== null;
  const isEditing = isFormOpen && formTarget !== undefined;

  const handleSave = async data => {
    if (isEditing) await updateHabit(formTarget.id, data);
    else await createHabit(data);
  };

  const handleArchive = async () => {
    if (isEditing) await archiveHabit(formTarget.id);
  };

  // Drag handlers
  const handleDragStart = useCallback((id) => setDragId(id), []);

  const handleDragOver = useCallback((id) => {
    if (id !== dragId) setDragOverId(id);
  }, [dragId]);

  const handleDrop = useCallback((targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = habits.map(h => h.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    const reordered = [...ids];
    reordered.splice(from, 1);
    reordered.splice(to, 0, dragId);
    reorderHabits(reordered);
    setDragId(null);
    setDragOverId(null);
  }, [dragId, habits, reorderHabits]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
  }, []);

  // Archive toggle
  const handleToggleArchived = async () => {
    if (!showArchived && archivedHabits.length === 0) {
      setArchivedLoading(true);
      const archived = await api.habits.listArchived();
      setArchivedHabits(archived);
      setArchivedLoading(false);
    }
    setShowArchived(v => !v);
  };

  const handleRestore = async (id) => {
    await api.habits.update(id, { archivedAt: null });
    setArchivedHabits(prev => prev.filter(h => h.id !== id));
    await reload();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Habits</h1>
        <button
          onClick={() => setFormTarget(undefined)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Habit
        </button>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}

      {!loading && habits.length === 0 && (
        <HabitsEmptyState onCreate={() => setFormTarget(undefined)} />
      )}

      {!loading && habits.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {habits.map(habit => (
            <HabitCard
              key={habit.id}
              habit={habit}
              logs={logs}
              onLog={logHabit}
              onUnlog={unlogHabit}
              onEdit={h => setFormTarget(h)}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              isDragging={dragId === habit.id}
              isDragOver={dragOverId === habit.id && dragId !== habit.id}
            />
          ))}
        </div>
      )}

      {/* Archive toggle */}
      {!loading && (
        <div className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleToggleArchived}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform duration-200 ${showArchived ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showArchived ? 'Hide archived habits' : 'Show archived habits'}
          </button>

          {showArchived && (
            <div className="mt-4">
              {archivedLoading && <div className="flex justify-center py-6"><Spinner /></div>}
              {!archivedLoading && archivedHabits.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No archived habits.</p>
              )}
              {!archivedLoading && archivedHabits.length > 0 && (
                <div className="space-y-2">
                  {archivedHabits.map(habit => (
                    <ArchivedHabitCard key={habit.id} habit={habit} onRestore={handleRestore} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isFormOpen && (
        <HabitForm
          initial={isEditing ? formTarget : undefined}
          sections={sections}
          onCreateSection={createSection}
          onSave={handleSave}
          onArchive={handleArchive}
          onClose={() => setFormTarget(null)}
        />
      )}
    </div>
  );
}

