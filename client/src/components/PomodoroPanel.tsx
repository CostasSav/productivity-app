import { useState, useEffect } from 'react';
import { PomodoroTimer } from './PomodoroTimer';

type Mode = 'full' | 'compact' | 'minimized';

const PHASE_COLORS: Record<string, string> = {
  work: '#6366f1',
  short_break: '#22c55e',
  long_break: '#14b8a6',
};

interface PomodoroPanelProps {
  task: { id: number; title: string };
  isTimerRunning: boolean;
  onRunningChange: (running: boolean) => void;
  onClose: () => void;
}

export function PomodoroPanel({ task, isTimerRunning, onRunningChange, onClose }: PomodoroPanelProps) {
  const [mode, setMode] = useState<Mode>('full');
  const [miniDisplay, setMiniDisplay] = useState({ mm: '25', ss: '00', phase: 'work' });

  // Poll localStorage for the live time to show in the minimized pill
  useEffect(() => {
    if (mode !== 'minimized') return;
    const read = () => {
      try {
        const s = JSON.parse(localStorage.getItem('pomodoro_state') || '{}');
        const secs = s.secondsLeft ?? 25 * 60;
        setMiniDisplay({
          mm: String(Math.floor(secs / 60)).padStart(2, '0'),
          ss: String(secs % 60).padStart(2, '0'),
          phase: s.phase ?? 'work',
        });
      } catch {}
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [mode]);

  const handleClose = () => {
    if (isTimerRunning && !window.confirm('Timer is running. Close the Pomodoro panel?')) return;
    onClose();
  };

  const phaseColor = PHASE_COLORS[miniDisplay.phase] ?? '#6366f1';

  // Minimized pill — sticks out from the right edge
  if (mode === 'minimized') {
    return (
      <>
        {/* Timer still mounted and running, just hidden */}
        <div className="hidden">
          <PomodoroTimer key={task.id} taskId={task.id} taskTitle={task.title} onRunningChange={onRunningChange} />
        </div>
        <div
          className="fixed bottom-24 right-0 z-50 flex flex-col items-center gap-2.5 py-4 px-2.5 bg-gray-900 rounded-l-2xl cursor-pointer shadow-2xl group"
          style={{ borderLeft: `3px solid ${phaseColor}` }}
          onClick={() => setMode('full')}
          title="Expand Pomodoro"
        >
          {isTimerRunning && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
              style={{ backgroundColor: phaseColor }} />
          )}
          <span
            className="font-mono text-sm font-bold text-white select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {miniDisplay.mm}:{miniDisplay.ss}
          </span>
          <svg className="w-3 h-3 text-gray-500 group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-auto sm:right-6 z-50" style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.18))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {mode === 'full' && (
            <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase">Pomodoro</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* Compact / expand toggle */}
          <button
            onClick={() => setMode(m => m === 'compact' ? 'full' : 'compact')}
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            title={mode === 'compact' ? 'Full view' : 'Compact view'}
          >
            {mode === 'compact' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            )}
          </button>
          {/* Minimize to side */}
          <button
            onClick={() => setMode('minimized')}
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Minimize to side"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          {/* Close */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Close panel"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Timer */}
      <div className="overflow-hidden sm:rounded-b-2xl">
        <PomodoroTimer
          key={task.id}
          taskId={task.id}
          taskTitle={task.title}
          onRunningChange={onRunningChange}
          compact={mode === 'compact'}
        />
      </div>
    </div>
  );
}
