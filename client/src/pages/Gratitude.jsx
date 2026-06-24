import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGratitude } from '../hooks/useGratitude';

// ── Constants ────────────────────────────────────────────────────────────────

const PROMPTS = [
  'Something that made you smile today',
  'A person you appreciate',
  'Something you often take for granted',
  'A small moment that felt good',
  'Something about your health or body',
  'A challenge that helped you grow',
  'Something beautiful you noticed',
  'A skill or ability you\'re glad you have',
  'Something that made today different',
  'A memory that makes you feel warm',
  'Someone who helped you recently',
  'Something in your home you appreciate',
  'A piece of good news, big or small',
  'Something about today\'s weather or nature',
  'A book, show, or song you enjoyed',
  'A mistake you learned from',
  'Something you\'re looking forward to',
  'A tool or technology that helps your life',
  'Something you did well today',
  'A relationship you\'re grateful for',
];

const MOOD_EMOJIS = ['😔', '😐', '🙂', '😊', '🌟'];
const MOOD_LABELS = ['Sad', 'Neutral', 'Good', 'Happy', 'Amazing'];

const MILESTONES = [
  [100, "100 days! You've truly made this part of who you are."],
  [60, 'Two months! This is who you are now.'],
  [30, "A full month — you've built a real habit."],
  [14, 'Two weeks of gratitude!'],
  [7, "One week! That's real commitment."],
];

const STOP_WORDS = new Set([
  'i', 'a', 'the', 'and', 'for', 'to', 'of', 'my', 'that', 'it', 'was', 'is',
  'in', 'on', 'at', 'so', 'me', 'we', 'this', 'with', 'very', 'just', 'be',
  'been', 'have', 'has', 'had', 'an', 'as', 'by', 'or', 'but', 'from', 'are',
  'were', 'am', 'do', 'did', 'not', 'no', 'its', 'also', 'their', 'they', 'our',
  'your', 'his', 'her', 'can', 'all', 'more', 'about', 'when', 'how', 'get',
  'got', 'will', 'would', 'could', 'should', 'than', 'then',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDayPrompts(dateStr) {
  let seed = 0;
  for (const c of dateStr) seed = (seed * 31 + c.charCodeAt(0)) & 0x7fffffff;
  const used = new Set();
  const result = [];
  let s = seed;
  while (result.length < 3) {
    s = ((s * 1664525) + 1013904223) & 0x7fffffff;
    const idx = Math.abs(s) % PROMPTS.length;
    if (!used.has(idx)) { used.add(idx); result.push(PROMPTS[idx]); }
  }
  return result;
}

function getMilestoneMsg(streak) {
  const match = MILESTONES.find(([n]) => streak === n);
  return match ? match[1] : null;
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function buildHeatmapGrid(entries, today) {
  const entryMap = {};
  for (const e of entries) entryMap[e.date] = e;
  const end = new Date(today + 'T12:00:00');
  const start = new Date(end);
  start.setMonth(start.getMonth() - 6);
  const dow = (start.getDay() + 6) % 7; // Mon=0
  start.setDate(start.getDate() - dow);
  const weeks = [];
  const cur = new Date(start);
  while (cur <= end) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().split('T')[0];
      week.push({ dateStr, entry: entryMap[dateStr] ?? null, isFuture: dateStr > today });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function getMonthLabels(weeks) {
  const labels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const month = new Date(week[0].dateStr + 'T12:00:00').getMonth();
    if (month !== lastMonth) {
      const label = new Date(week[0].dateStr + 'T12:00:00').toLocaleDateString('default', { month: 'short' });
      labels.push({ weekIndex: wi, label });
      lastMonth = month;
    }
  });
  return labels;
}

function getWordFreqs(entries) {
  const counts = {};
  entries.slice(0, 30).forEach(entry => {
    entry.items.forEach(item => {
      item.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(word => {
        if (word.length > 2 && !STOP_WORDS.has(word)) {
          counts[word] = (counts[word] || 0) + 1;
        }
      });
    });
  });
  return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 20);
}

function getCellClass(day) {
  if (day.isFuture) return '';
  if (!day.entry) return 'bg-gray-100 dark:bg-zinc-800/60';
  if (!day.entry.mood) return 'bg-teal-400/80';
  return ['bg-teal-300', 'bg-teal-400', 'bg-teal-500', 'bg-teal-600', 'bg-teal-700'][day.entry.mood - 1] ?? 'bg-teal-500';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
  );
}

function PastEntryRow({ entry, expanded, onToggle }) {
  return (
    <div
      className="border border-gray-100 dark:border-zinc-800/60 rounded-lg overflow-hidden cursor-pointer hover:border-gray-200 dark:hover:border-zinc-700 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs text-gray-400 dark:text-zinc-500 whitespace-nowrap font-mono flex-shrink-0">
          {fmtDate(entry.date)}
        </span>
        {!expanded && (
          <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{entry.items[0]}</span>
        )}
        {entry.streak > 1 && !expanded && (
          <span className="ml-auto flex items-center gap-1 text-xs text-orange-400 dark:text-orange-500 whitespace-nowrap flex-shrink-0">
            🔥 {entry.streak}
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 text-gray-300 dark:text-zinc-600 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''} ${entry.streak <= 1 || expanded ? 'ml-auto' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-3 space-y-2.5 border-t border-gray-50 dark:border-zinc-800/60">
          {entry.items.map((item, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-teal-400 font-mono text-xs flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{item}</p>
            </div>
          ))}
          {entry.mood != null && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50 dark:border-zinc-800/60">
              <span className="text-xs text-gray-400 dark:text-zinc-500">Mood</span>
              <span className="text-base leading-none">{MOOD_EMOJIS[entry.mood - 1]}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MoodSparkline({ entries }) {
  if (entries.length < 2) {
    return <p className="text-xs text-gray-400 dark:text-zinc-500 py-2">Not enough mood data yet</p>;
  }
  const W = 200, H = 44, PAD = 4;
  const iW = W - PAD * 2, iH = H - PAD * 2;
  const pts = entries.map((e, i) => [
    PAD + (i / (entries.length - 1)) * iW,
    PAD + ((5 - e.mood) / 4) * iH,
  ]);
  const ptsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11">
      {[1, 2, 3, 4, 5].map(mood => {
        const y = PAD + ((5 - mood) / 4) * iH;
        return (
          <line
            key={mood}
            x1={PAD} y1={y} x2={W - PAD} y2={y}
            stroke="currentColor" strokeWidth={0.5}
            className="text-gray-100 dark:text-zinc-800"
            strokeDasharray="2,2"
          />
        );
      })}
      <polyline points={ptsStr} fill="none" stroke="#2dd4bf" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#2dd4bf" />)}
    </svg>
  );
}

function StatsPanel({ allEntries, settings, today }) {
  const heatmapWeeks = useMemo(() => buildHeatmapGrid(allEntries, today), [allEntries, today]);
  const monthLabels = useMemo(() => getMonthLabels(heatmapWeeks), [heatmapWeeks]);
  const wordFreqs = useMemo(() => getWordFreqs(allEntries), [allEntries]);

  const moodEntries = useMemo(() => (
    allEntries.filter(e => e.mood != null).slice(0, 14).reverse()
  ), [allEntries]);

  const { avg7, avg14, moodArrow } = useMemo(() => {
    const withMood = allEntries.filter(e => e.mood != null);
    const last7 = withMood.slice(0, 7);
    const prev7 = withMood.slice(7, 14);
    const avg = arr => arr.length ? arr.reduce((s, e) => s + e.mood, 0) / arr.length : null;
    const a7 = avg(last7);
    const a14 = avg(prev7);
    let arrow = null;
    if (a7 != null && a14 != null) {
      if (a7 > a14 + 0.2) arrow = 'up';
      else if (a7 < a14 - 0.2) arrow = 'down';
    }
    return { avg7: a7, avg14: a14, moodArrow: arrow };
  }, [allEntries]);

  // 7-day streak circles (last 7 days, Mon-Sun order)
  const last7Days = useMemo(() => {
    const days = [];
    const completedDates = new Set(allEntries.map(e => e.date));
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({ dateStr, done: completedDates.has(dateStr), isToday: dateStr === today });
    }
    return days;
  }, [allEntries, today]);

  const maxFreq = wordFreqs.length > 0 ? wordFreqs[0][1] : 1;

  const CELL_SIZE = 12; // w-2.5 h-2.5 + gap-0.5 = 10 + 2 = 12px

  return (
    <div className="space-y-6 mt-6">

      {/* Streak section */}
      <div className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-4">Streak</p>
        <div className="flex items-baseline gap-6 mb-4">
          <div>
            <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">{settings?.currentStreak ?? 0}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">current</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{settings?.longestStreak ?? 0}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">longest</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{settings?.totalEntries ?? 0}</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">total</p>
          </div>
        </div>
        <div className="flex gap-1.5 items-center">
          {last7Days.map(day => {
            const dow = new Date(day.dateStr + 'T12:00:00').toLocaleDateString('default', { weekday: 'narrow' });
            return (
              <div key={day.dateStr} className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-300 dark:text-zinc-600">{dow}</span>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium
                    ${day.done
                      ? 'bg-teal-500 text-white'
                      : day.isToday
                      ? 'ring-2 ring-teal-400 ring-offset-1 dark:ring-offset-[#09090b] text-gray-400 dark:text-zinc-500'
                      : 'bg-gray-100 dark:bg-zinc-800/60 text-gray-300 dark:text-zinc-600'
                    }`}
                >
                  {day.done && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mood trend */}
      <div className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Mood trend</p>
          {avg7 != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {avg7.toFixed(1)}
              </span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">avg (7d)</span>
              {moodArrow === 'up' && (
                <svg className="w-3.5 h-3.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              )}
              {moodArrow === 'down' && (
                <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </div>
          )}
        </div>
        <MoodSparkline entries={moodEntries} />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-gray-300 dark:text-zinc-600">14 days ago</span>
          <span className="text-[9px] text-gray-300 dark:text-zinc-600">today</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-4">6-month heatmap</p>
        <div className="overflow-x-auto">
          <div className="inline-block">
            {/* Month labels */}
            <div className="relative h-4 mb-1" style={{ width: heatmapWeeks.length * CELL_SIZE + 'px' }}>
              {monthLabels.map(({ weekIndex, label }) => (
                <span
                  key={label + weekIndex}
                  className="absolute text-[9px] text-gray-400 dark:text-zinc-500"
                  style={{ left: weekIndex * CELL_SIZE + 'px' }}
                >
                  {label}
                </span>
              ))}
            </div>
            {/* Grid: 7 rows (Mon-Sun), N week columns */}
            <div className="flex gap-0.5">
              {heatmapWeeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      title={day.entry ? `${day.dateStr}: mood ${day.entry.mood ?? 'n/a'}` : day.dateStr}
                      className={`w-2.5 h-2.5 rounded-[2px] ${getCellClass(day)}`}
                    />
                  ))}
                </div>
              ))}
            </div>
            {/* Day labels */}
            <div className="flex mt-1 gap-0.5">
              <div className="flex flex-col gap-0.5 mr-1">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <span key={i} className="text-[8px] text-gray-300 dark:text-zinc-600 h-2.5 flex items-center">{d}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[9px] text-gray-400 dark:text-zinc-500">Less</span>
          {['bg-gray-100 dark:bg-zinc-800/60', 'bg-teal-300', 'bg-teal-400', 'bg-teal-500', 'bg-teal-600', 'bg-teal-700'].map((cls, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-[2px] ${cls}`} />
          ))}
          <span className="text-[9px] text-gray-400 dark:text-zinc-500">More</span>
        </div>
      </div>

      {/* Word cloud */}
      {wordFreqs.length > 0 && (
        <div className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-4">What you're grateful for</p>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {wordFreqs.map(([word, freq]) => {
              const ratio = freq / maxFreq;
              const cls = ratio >= 0.6
                ? 'text-base font-semibold text-teal-700 dark:text-teal-300'
                : ratio >= 0.3
                ? 'text-sm font-medium text-gray-700 dark:text-gray-300'
                : 'text-xs text-gray-500 dark:text-zinc-500';
              return (
                <span key={word} className={cls}>{word}</span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Gratitude() {
  const today = new Date().toISOString().split('T')[0];
  const prompts = getDayPrompts(today);

  const { todayEntry, allEntries, settings, saveGratitude, updateSettings } = useGratitude();

  const [step, setStep] = useState(1);
  const [items, setItems] = useState(['', '', '']);
  const [currentText, setCurrentText] = useState('');
  const [mood, setMood] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [savedEntry, setSavedEntry] = useState(null);

  const startedAtRef = useRef(null);
  const textareaRef = useRef(null);

  // Set initial step based on settings once they load.
  const initialStepSet = useRef(false);
  useEffect(() => {
    if (initialStepSet.current || settings === null || todayEntry === undefined) return;
    initialStepSet.current = true;
    if (!todayEntry) setStep(settings.onboardingComplete ? 1 : 0);
  }, [settings, todayEntry]);

  // Autofocus textarea; record ritual start time on step 1
  useEffect(() => {
    if (step === 1 && !startedAtRef.current) {
      startedAtRef.current = new Date();
    }
    if (step >= 1 && step <= 3) {
      const id = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [step]);

  // Auto-redirect from completion screen after 3 s (step is reset on next mount)
  useEffect(() => {
    if (step !== 5) return;
    const id = setTimeout(() => setEditMode(false), 3000);
    return () => clearTimeout(id);
  }, [step]);

  const handleNext = useCallback(() => {
    if (currentText.trim().length < 3) return;
    const newItems = [...items];
    newItems[step - 1] = currentText.trim();
    setItems(newItems);
    setCurrentText(newItems[step] || ''); // pre-fill next from existing (useful in edit mode)
    setStep(s => s + 1);
  }, [currentText, items, step]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNext(); }
  }, [handleNext]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const durationSeconds = startedAtRef.current
        ? Math.round((Date.now() - startedAtRef.current.getTime()) / 1000)
        : 0;
      const entry = await saveGratitude({
        items, mood, durationSeconds, completedAt: new Date().toISOString(),
      });
      setSavedEntry(entry);
      if (settings && !settings.onboardingComplete) {
        await updateSettings({ onboardingComplete: true });
      }
      setStep(5);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    const existing = todayEntry ? [...todayEntry.items] : ['', '', ''];
    setItems(existing);
    setCurrentText(existing[0] || '');
    setMood(todayEntry?.mood ?? null);
    startedAtRef.current = new Date();
    setSavedEntry(null);
    setStep(1);
    setEditMode(true);
  };

  const toggleExpanded = (id) =>
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Loading ──────────────────────────────────────────────────────────────

  if (todayEntry === undefined || settings === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // ── STATE 1: Already completed today ─────────────────────────────────────

  if (todayEntry && !editMode && step !== 5) {
    const pastEntries = allEntries.filter(e => e.date !== today);
    const milestone = getMilestoneMsg(todayEntry.streak);
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-10 sm:py-14">

          <p className="text-center text-2xl font-medium text-gray-800 dark:text-gray-100 mb-8 leading-snug">
            You've done your gratitude for today&nbsp;🌿
          </p>

          {milestone && (
            <div className="bg-teal-50 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-900/30 rounded-xl px-4 py-3 mb-4 text-center">
              <p className="text-sm text-teal-700 dark:text-teal-400 font-medium">{milestone}</p>
            </div>
          )}

          <div className="bg-white dark:bg-[#09090b] border border-gray-200 dark:border-zinc-800/60 rounded-xl p-5 mb-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-4">Today</p>
            <div className="space-y-3.5">
              {todayEntry.items.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-teal-400 font-mono text-sm flex-shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-gray-700 dark:text-gray-200 text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
            {todayEntry.mood != null && (
              <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-zinc-800/60 flex items-center gap-2">
                <span className="text-xs text-gray-400 dark:text-zinc-500">Mood</span>
                <span className="text-xl leading-none">{MOOD_EMOJIS[todayEntry.mood - 1]}</span>
              </div>
            )}
          </div>

          <div className="text-center mb-6">
            <button
              onClick={startEdit}
              className="text-sm text-gray-400 dark:text-zinc-500 hover:text-teal-500 dark:hover:text-teal-400 transition-colors cursor-pointer hover:underline underline-offset-2"
            >
              Edit today's entry
            </button>
          </div>

          <StatsPanel allEntries={allEntries} settings={settings} today={today} />

          {pastEntries.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-2 px-1">
                Past entries
              </p>
              <div className="space-y-1.5">
                {pastEntries.map(entry => (
                  <PastEntryRow
                    key={entry.id}
                    entry={entry}
                    expanded={expandedIds.has(entry.id)}
                    onToggle={() => toggleExpanded(entry.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── STATE 2: Ritual ──────────────────────────────────────────────────────

  // Step 5 — completion
  if (step === 5) {
    const streak = savedEntry?.streak ?? 1;
    const milestone = getMilestoneMsg(streak);
    return (
      <div
        className="min-h-full flex flex-col items-center justify-center px-4 py-12 cursor-pointer select-none"
        onClick={() => setEditMode(false)}
      >
        <div className="text-center max-w-sm">
          <p className="text-3xl font-medium text-gray-800 dark:text-gray-100 mb-5 leading-snug">
            Done. That's all it takes.&nbsp;🌿
          </p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl leading-none">🔥</span>
            <p className="text-lg font-semibold text-orange-500 dark:text-orange-400">
              You're on a {streak} day streak
            </p>
          </div>
          {milestone && (
            <p className="text-teal-600 dark:text-teal-400 font-medium text-sm mt-2">{milestone}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-8">Click anywhere to continue</p>
        </div>
      </div>
    );
  }

  // Step 0 — onboarding intro
  if (step === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-6 leading-none">🌿</div>
          <h2 className="text-2xl font-medium text-gray-800 dark:text-gray-100 mb-4">
            Gratitude Journal
          </h2>
          <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
            Each evening, write 3 things you're grateful for. Takes 2 minutes.
            Research shows this practice significantly improves wellbeing for months after.
          </p>
          <button
            onClick={() => { startedAtRef.current = new Date(); setStep(1); }}
            className="px-8 py-3 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            Start
          </button>
        </div>
      </div>
    );
  }

  // Steps 1-3 — prompts
  if (step >= 1 && step <= 3) {
    const canAdvance = currentText.trim().length >= 3;
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-6 text-center">
            {step} of 3
          </p>
          <h2 className="text-2xl font-medium text-gray-800 dark:text-gray-100 mb-8 text-center leading-snug">
            {prompts[step - 1]}
          </h2>
          <textarea
            ref={textareaRef}
            value={currentText}
            onChange={e => setCurrentText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="A few words is enough"
            rows={3}
            className="w-full bg-transparent border-b-2 border-gray-200 dark:border-zinc-700 focus:border-teal-400 dark:focus:border-teal-500 outline-none text-gray-700 dark:text-gray-200 text-lg py-2 resize-none transition-colors placeholder-gray-300 dark:placeholder-zinc-600 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-7">
            <div className="flex gap-2.5 items-center">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i < step - 1
                      ? 'w-2 h-2 bg-teal-500'
                      : i === step - 1
                      ? 'w-2.5 h-2.5 bg-teal-400'
                      : 'w-2 h-2 bg-gray-200 dark:bg-zinc-700'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleNext}
              disabled={!canAdvance}
              className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all cursor-pointer"
            >
              {step < 3 ? 'Next' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4 — mood check
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-2xl font-medium text-gray-800 dark:text-gray-100 mb-10">
          How are you feeling right now?
        </h2>
        <div className="flex justify-center gap-3 mb-10">
          {MOOD_EMOJIS.map((emoji, i) => (
            <button
              key={i}
              onClick={() => setMood(i + 1)}
              title={MOOD_LABELS[i]}
              className={`text-3xl w-12 h-12 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer
                ${mood === i + 1
                  ? 'scale-125 ring-2 ring-teal-400 ring-offset-2 ring-offset-white dark:ring-offset-[#111113]'
                  : 'hover:scale-110 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {saving ? 'Saving...' : mood != null ? 'Save' : 'Skip & Save'}
        </button>
      </div>
    </div>
  );
}
