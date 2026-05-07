import { useState, useEffect, useRef, useCallback } from 'react';
import { useDarkMode } from '../context/DarkModeContext';

const PHASES = {
  work:        { label: 'Focus',       duration: 25 * 60, color: '#6366f1', track: '#e0e7ff' },
  short_break: { label: 'Short Break', duration:  5 * 60, color: '#22c55e', track: '#dcfce7' },
  long_break:  { label: 'Long Break',  duration: 15 * 60, color: '#14b8a6', track: '#ccfbf1' },
};

const POMODOROS_BEFORE_LONG = 4;
const CX = 100;
const CY = 100;
const RADIUS = 86;
const STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function playBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[528, 0.28], [1056, 0.14], [1584, 0.07]].forEach(([freq, vol]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 2.4);
    });
  } catch {
    // Web Audio API unavailable — fail silently
  }
}

async function logWorkSession({ taskId, taskTitle, startedAt }) {
  try {
    await fetch('/api/pomodoro-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: taskId ?? null,
        taskTitle: taskTitle || 'Untitled',
        startedAt,
        completedAt: new Date().toISOString(),
        type: 'work',
      }),
    });
  } catch {
    // silently fail — a logging error must never disrupt the timer
  }
}

export function PomodoroTimer({ taskTitle, taskId, onRunningChange }) {
  const [phase, setPhase] = useState('work');
  const [secondsLeft, setSecondsLeft] = useState(PHASES.work.duration);
  const [running, setRunning] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const { dark } = useDarkMode();

  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);

  const phaseRef = useRef('work');
  const pomodorosRef = useRef(0);
  const sessionStartRef = useRef(null);

  const advancePhase = useCallback(() => {
    playBell();
    const cur = phaseRef.current;
    const count = pomodorosRef.current;

    if (cur === 'work' && sessionStartRef.current) {
      logWorkSession({ taskId, taskTitle, startedAt: sessionStartRef.current });
      window.dispatchEvent(new CustomEvent('pomodoro-session-complete'));
    }
    sessionStartRef.current = new Date().toISOString();

    if (cur === 'work') {
      const next = count + 1;
      pomodorosRef.current = next;
      setPomodorosCompleted(next);
      const nextPhase = next % POMODOROS_BEFORE_LONG === 0 ? 'long_break' : 'short_break';
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setSecondsLeft(PHASES[nextPhase].duration);
    } else {
      if (cur === 'long_break') {
        pomodorosRef.current = 0;
        setPomodorosCompleted(0);
      }
      phaseRef.current = 'work';
      setPhase('work');
      setSecondsLeft(PHASES.work.duration);
    }
  }, [taskId, taskTitle]);

  useEffect(() => {
    if (!running) return;
    if (!sessionStartRef.current) {
      sessionStartRef.current = new Date().toISOString();
    }
    const id = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          advancePhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, advancePhase]);

  const switchPhase = (key) => {
    setRunning(false);
    sessionStartRef.current = null;
    phaseRef.current = key;
    setPhase(key);
    setSecondsLeft(PHASES[key].duration);
  };

  const resetCurrent = () => {
    setRunning(false);
    sessionStartRef.current = null;
    setSecondsLeft(PHASES[phaseRef.current].duration);
  };

  const resetAll = () => {
    setRunning(false);
    sessionStartRef.current = null;
    phaseRef.current = 'work';
    pomodorosRef.current = 0;
    setPhase('work');
    setSecondsLeft(PHASES.work.duration);
    setPomodorosCompleted(0);
  };

  const { label, color, track } = PHASES[phase];
  const progress = secondsLeft / PHASES[phase].duration;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const dotsInSet = pomodorosCompleted % POMODOROS_BEFORE_LONG;

  const bgStyle = dark
    ? `linear-gradient(135deg, ${track}40 0%, #1f2937 100%)`
    : `linear-gradient(135deg, ${track} 0%, #ffffff 100%)`;

  return (
    <div className="flex flex-col items-center gap-5 p-7 rounded-2xl shadow-lg w-80 mx-auto select-none"
      style={{ background: bgStyle }}>

      {/* Phase tabs */}
      <div className={`flex w-full gap-1 rounded-full p-1 backdrop-blur-sm ${dark ? 'bg-gray-800/70' : 'bg-white/70'}`}>
        {Object.entries(PHASES).map(([key, p]) => (
          <button
            key={key}
            onClick={() => switchPhase(key)}
            className="flex-1 py-1 rounded-full text-xs font-semibold transition-all duration-200"
            style={phase === key
              ? { backgroundColor: p.color, color: '#fff', boxShadow: `0 1px 6px ${p.color}55` }
              : { color: dark ? '#6b7280' : '#9ca3af' }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Task title */}
      {taskTitle && (
        <p className="text-xs text-center w-full px-2" style={{ color }}>
          <span className="opacity-60">Working on </span>
          <span className="font-semibold block truncate">{taskTitle}</span>
        </p>
      )}

      {/* Circular progress ring */}
      <div className="relative" style={{ width: 210, height: 210 }}>
        <svg width="210" height="210" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={CX} cy={CY} r={RADIUS}
            fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'} strokeWidth={STROKE} />
          <circle cx={CX} cy={CY} r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transition: running
                ? 'stroke-dashoffset 1s linear'
                : 'stroke-dashoffset 0.4s ease, stroke 0.5s',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className={`text-5xl font-bold font-mono tracking-tight leading-none ${dark ? 'text-gray-100' : 'text-gray-800'}`}>
            {mm}:{ss}
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest mt-1"
            style={{ color: `${color}bb` }}>
            {label}
          </span>
          {running && (
            <span className="w-1.5 h-1.5 rounded-full mt-1 animate-pulse"
              style={{ backgroundColor: color }} />
          )}
        </div>
      </div>

      {/* Pomodoro progress dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: POMODOROS_BEFORE_LONG }, (_, i) => (
          <div key={i}
            className="w-2.5 h-2.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < dotsInSet ? color : dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              transform: i < dotsInSet ? 'scale(1.15)' : 'scale(1)',
            }}
          />
        ))}
        {pomodorosCompleted > 0 && (
          <span className="ml-1 text-xs font-medium" style={{ color: `${color}99` }}>
            {pomodorosCompleted} done
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-5">
        <button onClick={resetCurrent} title="Reset timer"
          className={`p-2 rounded-full transition-colors ${dark ? 'hover:bg-white/10 active:bg-white/15' : 'hover:bg-black/5 active:bg-black/10'}`}>
          <svg className="w-5 h-5" fill="none" stroke={color} strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={() => setRunning(r => !r)}
          className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95"
          style={{ backgroundColor: color, boxShadow: `0 4px 18px ${color}55` }}
        >
          {running ? (
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1.5" />
              <rect x="14" y="4" width="4" height="16" rx="1.5" />
            </svg>
          ) : (
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 3 }}>
              <path d="M6 4.5l13 7.5-13 7.5V4.5z" />
            </svg>
          )}
        </button>

        <button onClick={resetAll} title="Reset session"
          className={`p-2 rounded-full transition-colors ${dark ? 'hover:bg-white/10 active:bg-white/15' : 'hover:bg-black/5 active:bg-black/10'}`}>
          <svg className="w-5 h-5" fill="none" stroke={color} strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <p className={`text-xs text-center leading-snug ${dark ? 'text-gray-400' : 'text-gray-400'}`}>
        {phase === 'work'
          ? `${POMODOROS_BEFORE_LONG - dotsInSet} more until long break`
          : phase === 'long_break'
          ? 'Great work — enjoy your break!'
          : 'Almost there — short break'}
      </p>
    </div>
  );
}
