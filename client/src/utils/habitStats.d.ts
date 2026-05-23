import type { Habit } from '../types';

export function localDateStr(date?: Date): string;
export function logToLocalDate(isoStr: string): string;
export function getLast7Days(): string[];
export function getLast28Days(): string[];
export function isDue(habit: Habit, dow: number): boolean;
export function getMonday(d: Date): Date;
export function getWeekLogCount(logDates: Set<string>, weekStartDate: Date): number;
export function weeklyCountRemaining(habit: Habit, logDates: Set<string>): number;
export function isWeekFullyComplete(weekStartDate: Date, targetDays: number[], logDates: Set<string>): boolean;
export function calcCurrentStreak(habit: Habit, logDates: Set<string>): number;
export function calcLongestStreak(habit: Habit, logDates: Set<string>): number;
export function calcRate30(habit: Habit, logDates: Set<string>): number;
