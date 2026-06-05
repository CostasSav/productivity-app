import { Task } from '../types';
interface TodayProps { onFocusTask?: (task: Task) => void; onNavigateGratitude?: () => void; onNavigateGrocery?: () => void; }
export declare function Today(props: TodayProps): JSX.Element;
