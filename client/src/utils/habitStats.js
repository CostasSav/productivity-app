// Shared habit stat helpers used by both Habits.jsx and Today.jsx.

export function localDateStr(date = new Date()) {
  return (
    date.getFullYear() +
    '-' + String(date.getMonth() + 1).padStart(2, '0') +
    '-' + String(date.getDate()).padStart(2, '0')
  );
}

export function logToLocalDate(isoStr) {
  return localDateStr(new Date(isoStr));
}

export function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ dateStr: localDateStr(d), dow: d.getDay() });
  }
  return days;
}

export function getLast28Days() {
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ dateStr: localDateStr(d), dow: d.getDay() });
  }
  return days;
}

export function isDue(habit, dow) {
  if (habit.frequency === 'daily') return true;
  if (habit.frequency === 'weekly_count') return true; // any day can count
  return (habit.targetDays ?? []).includes(dow);
}

export function getMonday(d) {
  const day = d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  m.setHours(0, 0, 0, 0);
  return m;
}

// Count unique days logged within a Mon-Sun week starting at weekStartDate.
export function getWeekLogCount(logDates, weekStartDate) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    if (logDates.has(localDateStr(d))) count++;
  }
  return count;
}

// How many more logs are needed this week to hit the target (0 if already met).
export function weeklyCountRemaining(habit, logDates) {
  const weekStart = getMonday(new Date());
  const done = getWeekLogCount(logDates, weekStart);
  return Math.max(0, (habit.targetCount ?? 1) - done);
}

function getTargetDatesInWeek(weekStartDate, targetDays) {
  return (targetDays ?? []).map(dow => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + (dow === 0 ? 6 : dow - 1));
    return localDateStr(d);
  });
}

export function isWeekFullyComplete(weekStartDate, targetDays, logDates) {
  if (!targetDays?.length) return false;
  return getTargetDatesInWeek(weekStartDate, targetDays).every(d => logDates.has(d));
}

function calcDailyStreak(logDates) {
  if (!logDates.size) return 0;
  let streak = 0;
  const d = new Date();
  if (!logDates.has(localDateStr(d))) d.setDate(d.getDate() - 1);
  while (logDates.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function calcWeeklyStreak(targetDays, logDates) {
  if (!targetDays?.length) return 0;
  const today = localDateStr();
  const weekStart = getMonday(new Date());
  const currentDates = getTargetDatesInWeek(weekStart, targetDays);
  const pastDates = currentDates.filter(d => d <= today);
  if (pastDates.some(d => !logDates.has(d))) return 0;
  let streak = currentDates.every(d => logDates.has(d)) ? 1 : 0;
  weekStart.setDate(weekStart.getDate() - 7);
  while (isWeekFullyComplete(weekStart, targetDays, logDates)) {
    streak++;
    weekStart.setDate(weekStart.getDate() - 7);
  }
  return streak;
}

function calcWeeklyCountStreak(targetCount, logDates) {
  const weekStart = getMonday(new Date());
  const currentDone = getWeekLogCount(logDates, weekStart);
  // Current week counts only if already complete.
  let streak = currentDone >= targetCount ? 1 : 0;
  const prev = new Date(weekStart);
  prev.setDate(prev.getDate() - 7);
  while (getWeekLogCount(logDates, prev) >= targetCount) {
    streak++;
    prev.setDate(prev.getDate() - 7);
  }
  return streak;
}

export function calcCurrentStreak(habit, logDates) {
  if (habit.frequency === 'daily') return calcDailyStreak(logDates);
  if (habit.frequency === 'weekly_count') return calcWeeklyCountStreak(habit.targetCount ?? 1, logDates);
  return calcWeeklyStreak(habit.targetDays, logDates);
}

export function calcLongestStreak(habit, logDates) {
  if (!logDates.size) return 0;

  if (habit.frequency === 'daily') {
    const dates = [...logDates].sort();
    let maxRun = 1, run = 1;
    for (let i = 1; i < dates.length; i++) {
      const gap = (new Date(dates[i] + 'T12:00:00') - new Date(dates[i - 1] + 'T12:00:00')) / 86400000;
      if (gap === 1) { run++; if (run > maxRun) maxRun = run; }
      else run = 1;
    }
    return maxRun;
  }

  if (habit.frequency === 'weekly_count') {
    const tc = habit.targetCount ?? 1;
    const sorted = [...logDates].sort();
    const ws = getMonday(new Date(sorted[0] + 'T12:00:00'));
    const todayStr = localDateStr();
    let maxRun = 0, run = 0;
    while (localDateStr(ws) <= todayStr) {
      if (getWeekLogCount(logDates, ws) >= tc) { run++; if (run > maxRun) maxRun = run; }
      else run = 0;
      ws.setDate(ws.getDate() + 7);
    }
    return maxRun;
  }

  const td = habit.targetDays;
  if (!td?.length) return 0;
  const sorted = [...logDates].sort();
  const ws = getMonday(new Date(sorted[0] + 'T12:00:00'));
  const todayStr = localDateStr();
  let maxRun = 0, run = 0;
  while (localDateStr(ws) <= todayStr) {
    if (isWeekFullyComplete(ws, td, logDates)) { run++; if (run > maxRun) maxRun = run; }
    else run = 0;
    ws.setDate(ws.getDate() + 7);
  }
  return maxRun;
}

export function calcRate30(habit, logDates) {
  const today = new Date();
  let due = 0, done = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (isDue(habit, d.getDay())) {
      due++;
      if (logDates.has(localDateStr(d))) done++;
    }
  }
  return due === 0 ? null : Math.round((done / due) * 100);
}
