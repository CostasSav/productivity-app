import { PomodoroTimer } from './PomodoroTimer';

interface PomodoroPanelProps {
  task: { id: number; title: string };
  isTimerRunning: boolean;
  onRunningChange: (running: boolean) => void;
  onClose: () => void;
}

export function PomodoroPanel({ task, isTimerRunning, onRunningChange, onClose }: PomodoroPanelProps) {
  const handleClose = () => {
    if (isTimerRunning && !window.confirm('Timer is running. Close the Pomodoro panel?')) return;
    onClose();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50" style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.18))' }}>
      {/* Drag handle / header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase">Pomodoro</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded-full text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Timer — remounts on task change via key, resetting all internal state */}
      <div className="rounded-b-2xl overflow-hidden">
        <PomodoroTimer key={task.id} taskId={task.id} taskTitle={task.title} onRunningChange={onRunningChange} />
      </div>
    </div>
  );
}
