export interface PomodoroTimerProps {
  taskTitle?: string;
  taskId?: number | null;
  onRunningChange?: (running: boolean) => void;
  compact?: boolean;
}

export declare function PomodoroTimer(props: PomodoroTimerProps): JSX.Element;