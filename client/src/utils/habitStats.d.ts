import type { Habit } from '../types';

export function localDateStr(date?: Date): string;
export function logToLocalDate(isoStr: string): string;
export function getLast7Days(): { dateStr: string; dow: number }[];
export function getLast28Days(): { dateStr: string; dow: number }[];
export function isDue(habit: Habit, dow: number): boolean;
export function isWeekFullyComplete(weekStartDate: Date, targetDays: number[], logDates: Set<string>): boolean;
export function calcCurrentStreak(habit: Habit, logDates: Set<string>): number;
export function calcLongestStreak(habit: Habit, logDates: Set<string>): number;
export function calcRate30(habit: Habit, logDates: Set<string>): number | null;
