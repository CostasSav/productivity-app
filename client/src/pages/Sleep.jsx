import { useState, useEffect, useCallback, useRef } from 'react';
import { useSleep } from '../hooks/useSleep';

// ── Constants ─────────────────────────────────────────────────────────────────

const MOON_PHASES = ['🌑', '🌒', '🌓', '🌔', '🌕'];
const QUALITY_LABELS = ['Poor', 'Fair', 'Okay', 'Good', 'Great'];
const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'Good', 'Energised'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function calcDuration(bedtime, wakeTime) {
  const bed = timeToMinutes(bedtime);
  const wake = timeToMinutes(wakeTime);
  if (bed == null || wake == null) return null;
  return wake >= bed ? wake - bed : (1440 - bed) + wake;
}

function formatDuration(minutes) {
  if (minutes == null || minutes < 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function minutesToHHMM(totalMin) {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function weekdayLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function shortDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function durationBarColor(minutes) {
  if (minutes == null) return null;
  if (minutes < 360) return 'bg-red-500';
  if (minutes < 420) return 'bg-amber-400';
  return 'bg-teal-500';
}

// Normalizes bedtime for midnight-spanning averages and comparisons.
// Times before noon are assumed to be "early morning" → add 1440 so
// 01:00 (60 min) becomes 1500, comparable to 22:00 (1320 min).
function normalizeBedMin(hhmm) {
  const min = timeToMinutes(hhmm);
  if (min == null) return null;
  return min < 720 ? min + 1440 : min;
}

function avgOf(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-zinc-700 text-white text-sm px-4 py-2.5 rounded-full shadow-lg z-50 animate-fade-in">
      {message}
    </div>
  );
}

// ── Sleep Form ────────────────────────────────────────────────────────────────

function SleepForm({ initial, onSave, onCancel }) {
  const [bedtime, setBedtime] = useState(initial?.bedtime ?? '');
  const [wakeTime, setWakeTime] = useState(initial?.wakeTime ?? '');
  const [quality, setQuality] = useState(initial?.quality ?? null);
  const [energy, setEnergy] = useState(initial?.energy ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [saving, setSaving] = useState(false);

  const duration = calcDuration(bedtime, wakeTime);
  const canSave = bedtime && wakeTime && quality != null;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      await onSave({ bedtime, wakeTime, quality, energy: energy ?? null, note: note.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Went to bed</label>
          <input
            type="time"
            value={bedtime}
            onChange={e => setBedtime(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 dark:focus:border-teal-400 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Woke up</label>
          <input
            type="time"
            value={wakeTime}
            onChange={e => setWakeTime(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 dark:focus:border-teal-400 transition-colors"
          />
        </div>
      </div>

      {duration != null && (
        <div className="text-center">
          <span className="text-2xl font-semibold text-gray-900 dark:text-white">{formatDuration(duration)}</span>
          <span className="text-xs text-gray-400 dark:text-zinc-500 ml-2">of sleep</span>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">Sleep quality</p>
        <div className="flex gap-2">
          {MOON_PHASES.map((emoji, i) => {
            const val = i + 1;
            const selected = quality === val;
            return (
              <button key={val} onClick={() => setQuality(selected ? null : val)} title={QUALITY_LABELS[i]}
                className={`flex-1 py-2 rounded-lg text-xl transition-all cursor-pointer ${selected
                  ? 'bg-teal-100 dark:bg-teal-500/20 ring-2 ring-teal-500 dark:ring-teal-400 scale-105'
                  : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10'}`}>
                {emoji}
              </button>
            );
          })}
        </div>
        {quality != null && <p className="text-xs text-center text-gray-400 dark:text-zinc-500 mt-1">{QUALITY_LABELS[quality - 1]}</p>}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2">Morning energy</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(val => {
            const selected = energy === val;
            return (
              <button key={val} onClick={() => setEnergy(selected ? null : val)} title={ENERGY_LABELS[val - 1]}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${selected
                  ? 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500 dark:ring-teal-400 scale-105'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-white/10'}`}>
                {val}
              </button>
            );
          })}
        </div>
        {energy != null && <p className="text-xs text-center text-gray-400 dark:text-zinc-500 mt-1">{ENERGY_LABELS[energy - 1]}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">
          Note <span className="font-normal text-gray-400 dark:text-zinc-600">(optional)</span>
        </label>
        <input type="text" value={note} onChange={e => setNote(e.target.value)}
          placeholder="How did you feel? Any dreams?"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 dark:focus:border-teal-400 transition-colors"
        />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
            Cancel
          </button>
        )}
        <button onClick={handleSave} disabled={!canSave || saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${canSave && !saving
            ? 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm cursor-pointer'
            : 'bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-zinc-600 cursor-not-allowed'}`}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ entry, onEdit }) {
  const duration = calcDuration(entry.bedtime, entry.wakeTime);
  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <div className="text-4xl font-bold text-gray-900 dark:text-white">{formatDuration(duration)}</div>
        <div className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
          {formatTime12(entry.bedtime)} → {formatTime12(entry.wakeTime)}
        </div>
      </div>
      <div className="flex gap-3 justify-center flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-white/5">
          <span className="text-xl">{MOON_PHASES[entry.quality - 1]}</span>
          <div>
            <div className="text-xs text-gray-400 dark:text-zinc-500">Quality</div>
            <div className="text-sm font-medium text-gray-800 dark:text-zinc-200">{QUALITY_LABELS[entry.quality - 1]}</div>
          </div>
        </div>
        {entry.energy != null && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 dark:bg-white/5">
            <span className="text-xl font-bold text-teal-600 dark:text-teal-400">{entry.energy}</span>
            <div>
              <div className="text-xs text-gray-400 dark:text-zinc-500">Energy</div>
              <div className="text-sm font-medium text-gray-800 dark:text-zinc-200">{ENERGY_LABELS[entry.energy - 1]}</div>
            </div>
          </div>
        )}
      </div>
      {entry.note && <p className="text-sm text-gray-600 dark:text-zinc-400 text-center italic">"{entry.note}"</p>}
      <div className="text-center">
        <button onClick={onEdit} className="text-sm text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">
          Edit entry
        </button>
      </div>
    </div>
  );
}

// ── Past-day Modal ────────────────────────────────────────────────────────────

function PastDayModal({ date, entry, onSave, onClose }) {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1c1c1f] rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <SleepForm initial={entry} onSave={async data => { await onSave(date, data); onClose(); }} onCancel={onClose} />
      </div>
    </div>
  );
}

// ── 7-day chip row ────────────────────────────────────────────────────────────

function WeekRow({ days, entries, onChipClick }) {
  const today = todayStr();
  return (
    <div className="flex gap-2">
      {days.map(date => {
        const isToday = date === today;
        const entry = entries[date];
        const duration = entry ? calcDuration(entry.bedtime, entry.wakeTime) : null;
        const barColor = durationBarColor(duration);
        const barPct = duration != null ? Math.min(100, (duration / 600) * 100) : 0;
        return (
          <button key={date} onClick={() => !isToday && onChipClick(date)} disabled={isToday}
            title={isToday ? 'Today' : duration != null ? `${weekdayLabel(date)}: ${formatDuration(duration)}` : `${weekdayLabel(date)}: no entry`}
            className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl transition-colors ${isToday
              ? 'bg-teal-50 dark:bg-teal-500/10 ring-2 ring-teal-500 dark:ring-teal-400'
              : 'bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer'}`}>
            <span className={`text-xs font-medium ${isToday ? 'text-teal-700 dark:text-teal-400' : 'text-gray-500 dark:text-zinc-500'}`}>
              {weekdayLabel(date)}
            </span>
            <div className="w-5 h-10 rounded-full bg-gray-200 dark:bg-white/10 flex flex-col justify-end overflow-hidden">
              {duration != null
                ? <div className={`${barColor} w-full transition-all rounded-full`} style={{ height: `${barPct}%` }} />
                : <div className="w-full h-full border-2 border-dashed border-gray-300 dark:border-white/20 rounded-full" />}
            </div>
            <span className="text-xs text-gray-400 dark:text-zinc-600">{duration != null ? formatDuration(duration) : '–'}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueClass = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="flex-1 bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3 text-center min-w-0">
      <div className={`text-base font-bold truncate ${valueClass}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5 truncate">{sub}</div>}
      <div className="text-xs text-gray-500 dark:text-zinc-500 mt-1 truncate">{label}</div>
    </div>
  );
}

// ── Collapsible Panel ─────────────────────────────────────────────────────────

function CollapsiblePanel({ title, open, onToggle, children }) {
  return (
    <div className="bg-white dark:bg-[#1c1c1f] rounded-2xl border border-gray-100 dark:border-white/[0.06] shadow-sm overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
        <span className="text-sm font-semibold text-gray-800 dark:text-zinc-200">{title}</span>
        <svg className={`w-4 h-4 flex-shrink-0 text-gray-400 dark:text-zinc-500 transition-transform duration-250 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {/* CSS Grid expand/collapse — animates to actual content height */}
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.28s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className="px-5 pb-5 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── Debt Sparkline ────────────────────────────────────────────────────────────

function DebtSparkline({ points }) {
  if (points.length < 2) return null;
  const W = 300; const H = 52;
  const pl = 4; const pr = 4; const pt = 6; const pb = 6;
  const cW = W - pl - pr; const cH = H - pt - pb;

  const maxVal = Math.max(1, ...points); // always >= 1 to avoid /0
  const getX = i => pl + (i / (points.length - 1)) * cW;
  const getY = v => pt + cH * (1 - v / maxVal);

  const poly = points.map((v, i) => `${getX(i)},${getY(v)}`).join(' ');

  // Area fill under the line
  const firstX = getX(0); const lastX = getX(points.length - 1);
  const baseY = pt + cH;
  const areaPath = `M${firstX},${baseY} ${points.map((v, i) => `L${getX(i)},${getY(v)}`).join(' ')} L${lastX},${baseY} Z`;

  const finalDebt = points[points.length - 1];
  const lineColor = finalDebt === 0 ? '#14b8a6' : finalDebt < 120 ? '#f59e0b' : '#ef4444';
  const areaColor = finalDebt === 0 ? '#14b8a620' : finalDebt < 120 ? '#f59e0b18' : '#ef444418';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 52 }}>
      <path d={areaPath} fill={areaColor} />
      <polyline points={poly} fill="none" stroke={lineColor} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Sleep Debt Panel ──────────────────────────────────────────────────────────

function SleepDebtPanel({ allEntries, settings, serverDebt }) {
  const [open, setOpen] = useState(false);

  const targetMin = Math.round((settings?.sleepTarget ?? 7.5) * 60);
  const targetH = settings?.sleepTarget ?? 7.5;
  const targetLabel = Number.isInteger(targetH) ? `${targetH}h` : `${targetH}h`;
  const days14 = lastNDays(14);

  // Build per-day data (oldest→newest)
  const dayData = days14.map(date => {
    const entry = allEntries[date];
    if (!entry) return { date, actualMin: null, diff: null };
    const actualMin = calcDuration(entry.bedtime, entry.wakeTime);
    const diff = actualMin != null ? actualMin - targetMin : null; // positive=surplus, negative=deficit
    return { date, actualMin, diff };
  });

  // Running clamped debt (surplus repays debt, can't go below 0)
  let rd = 0;
  const sparkPoints = dayData.map(d => {
    if (d.diff != null) rd = Math.max(0, rd + (targetMin - d.actualMin));
    return rd;
  });

  // Use server-computed total for the bar (authoritative)
  const totalDebtMin = serverDebt ?? 0;
  const maxDebtMin = 14 * 60;
  const debtPct = Math.min(100, (totalDebtMin / maxDebtMin) * 100);
  const debtBarCls = totalDebtMin === 0 ? 'bg-teal-500' : totalDebtMin < 120 ? 'bg-amber-400' : 'bg-red-500';
  const debtTextCls = totalDebtMin === 0 ? 'text-teal-600 dark:text-teal-400' : totalDebtMin < 120 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  const hasDebt = sparkPoints.some(v => v > 0);

  // Table in newest-first order
  const tableRows = [...dayData].reverse();
  const today = todayStr();

  return (
    <CollapsiblePanel title="Sleep Debt" open={open} onToggle={() => setOpen(o => !o)}>
      <p className="text-xs text-gray-500 dark:text-zinc-500 mb-4 leading-relaxed">
        Sleep debt is how much sleep you owe your body over the last 14 nights,
        based on your target of{' '}
        <strong className="text-gray-700 dark:text-zinc-300">{targetLabel}</strong> per night.
        Sleeping extra repays the debt.
      </p>

      {/* Debt bar */}
      <div className="mb-5">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className={`text-xs font-semibold ${debtTextCls}`}>
            {totalDebtMin === 0 ? 'No debt' : `${formatDuration(totalDebtMin)} owed`}
          </span>
          <span className="text-xs text-gray-400 dark:text-zinc-600">14h max</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${debtBarCls}`}
            style={{ width: `${debtPct}%` }} />
        </div>
      </div>

      {/* Sparkline */}
      {hasDebt && (
        <div className="mb-5">
          <p className="text-xs text-gray-400 dark:text-zinc-600 mb-1.5">14-day debt trend (surplus repays)</p>
          <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl px-2 py-1">
            <DebtSparkline points={sparkPoints} />
          </div>
          <div className="flex justify-between text-xs text-gray-300 dark:text-zinc-700 mt-1 px-1">
            <span>{shortDateLabel(days14[0])}</span>
            <span>{shortDateLabel(days14[days14.length - 1])}</span>
          </div>
        </div>
      )}

      {/* Day-by-day table */}
      <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-white/[0.06]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-white/[0.04]">
              <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-zinc-500">Date</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-zinc-500">Slept</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-zinc-500">Target</th>
              <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-zinc-500">Diff</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ date, actualMin, diff }) => (
              <tr key={date} className={`border-t border-gray-50 dark:border-white/[0.04] ${date === today ? 'bg-teal-50/50 dark:bg-teal-500/[0.06]' : ''}`}>
                <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                  {shortDateLabel(date)}
                  {date === today && <span className="ml-1 text-teal-500 dark:text-teal-400 font-medium"> ·</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-700 dark:text-zinc-300">
                  {actualMin != null ? formatDuration(actualMin) : <span className="text-gray-300 dark:text-zinc-700">—</span>}
                </td>
                <td className="px-3 py-2 text-right text-gray-400 dark:text-zinc-600">{formatDuration(targetMin)}</td>
                <td className={`px-3 py-2 text-right font-medium ${
                  diff == null ? 'text-gray-300 dark:text-zinc-700' :
                  diff >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-red-500 dark:text-red-400'}`}>
                  {diff == null ? '—' : diff >= 0 ? `+${formatDuration(diff)}` : `−${formatDuration(-diff)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsiblePanel>
  );
}

// ── Bed/Wake Dot Plot ─────────────────────────────────────────────────────────

function BedWakeDotPlot({ entries }) {
  // X-axis: 20:00 → 12:00 (next day) = 16 h = 960 min
  const AXIS_START = 1200; // 20:00 in minutes
  const AXIS_RANGE = 960;

  const W = 400; const H = 88;
  const pl = 32; const pr = 6; const pt = 10; const pb = 22;
  const cW = W - pl - pr; const cH = H - pt - pb; // content area

  const BED_Y  = pt + cH * 0.28;
  const WAKE_Y = pt + cH * 0.72;
  const AXIS_Y = pt + cH;

  function timeX(hhmm) {
    const min = timeToMinutes(hhmm);
    if (min == null) return null;
    const offset = min >= AXIS_START ? min - AXIS_START : min <= 720 ? (1440 - AXIS_START) + min : null;
    if (offset == null) return null;
    return pl + (offset / AXIS_RANGE) * cW;
  }

  const ticks = [
    { min: 1200, label: '20' },
    { min: 1320, label: '22' },
    { min: 0,    label: '00', midnight: true },
    { min: 120,  label: '02' },
    { min: 240,  label: '04' },
    { min: 360,  label: '06' },
    { min: 480,  label: '08' },
    { min: 600,  label: '10' },
    { min: 720,  label: '12' },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 88 }}>
      {/* Row labels */}
      <text x={pl - 4} y={BED_Y + 3.5} textAnchor="end" fontSize={8} fill="#9ca3af">Bed</text>
      <text x={pl - 4} y={WAKE_Y + 3.5} textAnchor="end" fontSize={8} fill="#9ca3af">Wake</text>

      {/* Tick grid lines */}
      {ticks.map(t => {
        const x = t.min >= AXIS_START ? pl + ((t.min - AXIS_START) / AXIS_RANGE) * cW
          : t.min <= 720 ? pl + ((1440 - AXIS_START + t.min) / AXIS_RANGE) * cW : null;
        if (x == null) return null;
        return (
          <line key={t.label} x1={x} y1={pt} x2={x} y2={AXIS_Y}
            stroke={t.midnight ? '#94a3b8' : '#e5e7eb'} strokeWidth={t.midnight ? 0.75 : 0.5}
            strokeDasharray={t.midnight ? '3,2' : undefined} />
        );
      })}

      {/* Axis baseline */}
      <line x1={pl} y1={AXIS_Y} x2={W - pr} y2={AXIS_Y} stroke="#e5e7eb" strokeWidth={0.5} />

      {/* Tick labels */}
      {ticks.map(t => {
        const x = t.min >= AXIS_START ? pl + ((t.min - AXIS_START) / AXIS_RANGE) * cW
          : t.min <= 720 ? pl + ((1440 - AXIS_START + t.min) / AXIS_RANGE) * cW : null;
        if (x == null) return null;
        return (
          <text key={t.label} x={x} y={AXIS_Y + 11} textAnchor="middle" fontSize={7} fill="#9ca3af">{t.label}</text>
        );
      })}

      {/* Bed dots (indigo) */}
      {entries.map((e, i) => {
        const x = timeX(e.bedtime);
        return x != null ? <circle key={`b${i}`} cx={x} cy={BED_Y} r={4} fill="#6366f1" opacity={0.7} /> : null;
      })}

      {/* Wake dots (amber) */}
      {entries.map((e, i) => {
        const x = timeX(e.wakeTime);
        return x != null ? <circle key={`w${i}`} cx={x} cy={WAKE_Y} r={4} fill="#f59e0b" opacity={0.7} /> : null;
      })}
    </svg>
  );
}

// ── Consistency Panel ─────────────────────────────────────────────────────────

function ConsistencyPanel({ allEntries, consistencyScore }) {
  const [open, setOpen] = useState(false);

  const days14 = lastNDays(14);
  const entries14 = days14.map(d => allEntries[d]).filter(Boolean);

  // Averages
  const bedNorm   = entries14.map(e => normalizeBedMin(e.bedtime)).filter(v => v != null);
  const wakeMins  = entries14.map(e => timeToMinutes(e.wakeTime)).filter(v => v != null);
  const avgBedRaw = avgOf(bedNorm);
  const avgWakeRaw = avgOf(wakeMins);
  const avgBed  = avgBedRaw  != null ? Math.round(avgBedRaw)  % 1440 : null;
  const avgWake = avgWakeRaw != null ? Math.round(avgWakeRaw) : null;

  // Ranges — using normalized values so midnight-crossers compare correctly
  const earliestBed = bedNorm.length ? Math.min(...bedNorm) % 1440 : null;
  const latestBed   = bedNorm.length ? Math.max(...bedNorm) % 1440 : null;
  const earliestWake = wakeMins.length ? Math.min(...wakeMins) : null;
  const latestWake   = wakeMins.length ? Math.max(...wakeMins) : null;

  const scoreColor = consistencyScore == null ? '' :
    consistencyScore >= 80 ? 'text-teal-600 dark:text-teal-400' :
    consistencyScore >= 60 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-500 dark:text-red-400';
  const scoreDesc = consistencyScore == null ? '' :
    consistencyScore >= 80 ? 'Excellent — very regular schedule' :
    consistencyScore >= 60 ? 'Good — minor variation' :
    'Irregular — large bedtime swings';

  return (
    <CollapsiblePanel title="Consistency Breakdown" open={open} onToggle={() => setOpen(o => !o)}>
      {entries14.length < 2 ? (
        <p className="text-sm text-gray-400 dark:text-zinc-500 text-center py-4">
          Log a few nights to see your patterns.
        </p>
      ) : (
        <div className="space-y-5">
          {/* Avg times + ranges */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3">
              <div className="text-xs text-gray-400 dark:text-zinc-500 mb-1">Avg bedtime</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {avgBed != null ? minutesToHHMM(avgBed) : '—'}
              </div>
              {earliestBed != null && latestBed != null && (
                <div className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">
                  {minutesToHHMM(earliestBed)} – {minutesToHHMM(latestBed)}
                </div>
              )}
            </div>
            <div className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3">
              <div className="text-xs text-gray-400 dark:text-zinc-500 mb-1">Avg wake time</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {avgWake != null ? minutesToHHMM(avgWake) : '—'}
              </div>
              {earliestWake != null && latestWake != null && (
                <div className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">
                  {minutesToHHMM(earliestWake)} – {minutesToHHMM(latestWake)}
                </div>
              )}
            </div>
          </div>

          {/* Score badge */}
          {consistencyScore != null && (
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-white/[0.04] rounded-xl">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{consistencyScore}%</span>
              <div>
                <div className="text-xs font-semibold text-gray-700 dark:text-zinc-300">Consistency score</div>
                <div className="text-xs text-gray-400 dark:text-zinc-500">{scoreDesc}</div>
              </div>
            </div>
          )}

          {/* Dot plot */}
          <div>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">
              Bedtime & wake schedule — last 14 nights
            </p>
            <div className="bg-gray-50 dark:bg-white/[0.03] rounded-xl p-2 overflow-hidden">
              <BedWakeDotPlot entries={entries14} />
            </div>
            <div className="flex gap-5 mt-2 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6366f1', opacity: 0.75 }} />
                Bedtime
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#f59e0b', opacity: 0.75 }} />
                Wake time
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500">
                <span className="inline-block w-5 h-px bg-slate-400" style={{ verticalAlign: 'middle', borderTop: '1px dashed #94a3b8' }} />
                Midnight
              </span>
            </div>
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
}

// ── Weekly Insight Card ───────────────────────────────────────────────────────

function MoonIcon() {
  return (
    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function WeeklyInsight({ settings, generating, error, onRefresh }) {
  const today = todayStr();
  const lastGen = settings?.aiInsightLastGenerated ?? null;
  const text = settings?.aiInsightText ?? null;

  const daysAgo = lastGen
    ? Math.round((new Date(today + 'T12:00:00').getTime() - new Date(lastGen + 'T12:00:00').getTime()) / 86400000)
    : null;

  const ageLabel = daysAgo === 0 ? 'Today'
    : daysAgo === 1 ? 'Yesterday'
    : daysAgo != null ? `${daysAgo} days ago`
    : null;

  const refreshDisabled = generating || lastGen === today;

  return (
    <div className="bg-white dark:bg-[#1c1c1f] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-4 right-4 text-indigo-300 dark:text-indigo-800 pointer-events-none select-none">
        <MoonIcon />
      </div>

      <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-3">Weekly Insight</p>

      {generating ? (
        <p className="text-sm text-gray-400 dark:text-zinc-500 animate-pulse leading-relaxed pr-10">
          Analyzing your sleep patterns...
        </p>
      ) : error ? (
        <p className="text-sm text-red-400 dark:text-red-500 leading-relaxed pr-10">
          Could not load insight.
        </p>
      ) : text ? (
        <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed pr-10 whitespace-pre-line">{text}</p>
      ) : (
        <p className="text-sm text-gray-400 dark:text-zinc-500 leading-relaxed italic pr-10">
          Log a few nights of sleep to get your first insight.
        </p>
      )}

      <div className="flex items-center gap-2 mt-3">
        {ageLabel && !generating && !error && (
          <>
            <span className="text-xs text-gray-400 dark:text-zinc-600">Generated {ageLabel}</span>
            <span className="text-xs text-gray-300 dark:text-zinc-700">·</span>
          </>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshDisabled}
          className={`text-xs transition-colors ${refreshDisabled && !error ? 'text-gray-300 dark:text-zinc-700 cursor-not-allowed' : 'text-teal-600 dark:text-teal-400 hover:underline cursor-pointer'}`}
        >
          {generating ? 'Generating…' : lastGen === today && !error ? 'Refreshed today' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Sleep({ onEntrySaved }) {
  const {
    entriesMap: entries,
    stats,
    settings,
    loading,
    insightGenerating,
    saveSleep,
    generateInsight: runGenerateInsight,
  } = useSleep();

  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);
  const [pastDay, setPastDay] = useState(null);
  const [insightError, setInsightError] = useState(false);
  const insightAutoAttempted = useRef(false);

  const weekDays = lastNDays(7);

  const todayEntry = loading ? undefined : (entries[todayStr()] ?? null);

  const generateInsight = useCallback(async () => {
    setInsightError(false);
    try {
      await runGenerateInsight();
    } catch {
      setInsightError(true);
    }
  }, [runGenerateInsight]);

  useEffect(() => {
    if (!settings || insightAutoAttempted.current) return;
    insightAutoAttempted.current = true;
    const lastGen = settings.aiInsightLastGenerated;
    if (!lastGen) { generateInsight(); return; }
    const daysOld = Math.round(
      (new Date(todayStr() + 'T12:00:00').getTime() - new Date(lastGen + 'T12:00:00').getTime()) / 86400000
    );
    if (daysOld > 6) generateInsight();
  }, [settings, generateInsight]);

  const handleSaveToday = async data => {
    await saveSleep({ date: todayStr(), ...data });
    setEditing(false);
    setToast('Sleep logged');
    onEntrySaved?.(todayStr());
  };

  const handleSavePast = async (date, data) => {
    await saveSleep({ date, ...data });
    setToast('Entry saved');
    onEntrySaved?.(date);
  };

  // Stat card values
  const avgSleep7d  = stats?.averageDuration7d ?? null;
  const sleepDebt   = stats?.currentSleepDebt ?? 0;
  const consistency = stats?.consistencyScore ?? null;
  const streak      = stats?.currentStreak ?? 0;

  const debtClass = sleepDebt === 0 ? 'text-teal-600 dark:text-teal-400'
    : sleepDebt < 120 ? 'text-amber-500 dark:text-amber-400'
    : 'text-red-500 dark:text-red-400';

  const consistencyClass = consistency == null ? 'text-gray-400 dark:text-zinc-500'
    : consistency >= 80 ? 'text-teal-600 dark:text-teal-400'
    : consistency >= 60 ? 'text-amber-500 dark:text-amber-400'
    : 'text-red-500 dark:text-red-400';

  return (
    <div className="flex flex-col h-full overflow-y-auto w-full">
      <div className="max-w-lg mx-auto w-full px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sleep</h1>
          <p className="text-sm text-gray-400 dark:text-zinc-500 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Today's card */}
        <div className="bg-white dark:bg-[#1c1c1f] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-6 shadow-sm">
          {loading ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : todayEntry && !editing ? (
            <SummaryCard entry={todayEntry} onEdit={() => setEditing(true)} />
          ) : (
            <SleepForm
              initial={editing && todayEntry ? todayEntry : null}
              onSave={handleSaveToday}
              onCancel={editing && todayEntry ? () => setEditing(false) : null}
            />
          )}
        </div>

        {/* 7-day row */}
        <div className="bg-white dark:bg-[#1c1c1f] rounded-2xl border border-gray-100 dark:border-white/[0.06] p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide mb-3">Last 7 days</p>
          <WeekRow days={weekDays} entries={entries} onChipClick={setPastDay} />
          <div className="flex gap-4 mt-3 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt;6h
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-600">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> 6–7h
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-600">
              <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" /> 7h+
            </span>
          </div>
        </div>

        {/* Stat cards */}
        {!loading && stats && (
          <div className="flex gap-2">
            <StatCard
              label="Avg sleep"
              value={avgSleep7d != null ? formatDuration(avgSleep7d) : null}
              sub="7-night avg"
            />
            <StatCard
              label="Sleep debt"
              value={sleepDebt === 0 ? 'None' : formatDuration(sleepDebt)}
              sub="14 nights"
              valueClass={debtClass}
            />
            <StatCard
              label="Consistency"
              value={consistency != null ? `${consistency}%` : null}
              sub="schedule"
              valueClass={consistencyClass}
            />
            <StatCard
              label="Streak"
              value={streak > 0 ? `${streak}d` : null}
              sub="logged"
            />
          </div>
        )}

        {/* Weekly AI Insight */}
        {!loading && settings && (
          <WeeklyInsight
            settings={settings}
            generating={insightGenerating}
            error={insightError}
            onRefresh={generateInsight}
          />
        )}

        {/* Collapsible analysis panels */}
        {!loading && stats && settings && (
          <>
            <SleepDebtPanel
              allEntries={entries}
              settings={settings}
              serverDebt={stats.currentSleepDebt}
            />
            <ConsistencyPanel
              allEntries={entries}
              consistencyScore={stats.consistencyScore}
            />
          </>
        )}

      </div>

      {pastDay && (
        <PastDayModal
          date={pastDay}
          entry={entries[pastDay] ?? null}
          onSave={handleSavePast}
          onClose={() => setPastDay(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
