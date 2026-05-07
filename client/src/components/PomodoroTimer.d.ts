export interface PomodoroTimerProps {
  taskTitle?: string;
  taskId?: number | null;
  onRunningChange?: (running: boolean) => void;
}

export declare function PomodoroTimer(props: PomodoroTimerProps): JSX.Element;
