import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayBounds, feedWarning, filterEventsForRange, findConflicts, conflictsWith, formatEventRange, packColumns, paddedRange,
  refreshErrorMessage, relativeAge, splitTimedEvents, allDayEventsFor, formatDayRange, type DaySegment,
} from '../src/utils/calendarLayout';
import { localTodayStr, offsetDay, weekOf } from '../src/utils/date';
import type { CalendarEvent } from '../src/types';

// All expectations are for a browser in France. Synthetic events only.
process.env.TZ = 'Europe/Paris';

let n = 0;
const ev = (start: string, end: string, fields: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({ id: `e${++n}`, feedId: 'work', title: `Synthetic ${n}`, start, end, allDay: false, ...fields });
const allDay = (date: string, endDate: string, fields: Partial<CalendarEvent> = {}) =>
  ev(`${date}T00:00:00.000Z`, `${endDate}T00:00:00.000Z`, { allDay: true, ...fields });
const seg = (id: string, startMin: number, endMin: number): DaySegment =>
  ({ event: ev('2026-11-04T08:00:00Z', '2026-11-04T09:00:00Z', { id }), day: '2026-11-04', startMin, endMin, continuesBefore: false, continuesAfter: false });

test('range padding: one extra UTC day each side, then local-day filtering', () => {
  assert.deepEqual(paddedRange('2026-11-04', '2026-11-04'), { from: '2026-11-03', to: '2026-11-05' });
  assert.deepEqual(paddedRange('2026-10-26', '2026-11-01'), { from: '2026-10-25', to: '2026-11-02' });

  const earlyLocal = ev('2026-11-03T23:30:00Z', '2026-11-04T00:30:00Z', { title: 'early' }); // 00:30 Paris on the 4th
  const lateLocal = ev('2026-11-04T22:30:00Z', '2026-11-04T23:00:00Z', { title: 'late' });   // 23:30 Paris on the 4th
  const nextDay = ev('2026-11-04T23:00:00Z', '2026-11-04T23:30:00Z', { title: 'next' });     // 00:00 Paris on the 5th
  const endsAtMidnight = ev('2026-11-03T22:00:00Z', '2026-11-03T23:00:00Z', { title: 'prev' }); // 23:00–00:00 on the 3rd
  const instant = ev('2026-11-03T23:00:00Z', '2026-11-03T23:00:00Z', { title: 'instant' });  // zero length, 00:00 on the 4th
  const holiday = allDay('2026-11-04', '2026-11-05', { title: 'holiday' });
  const otherHolidays = [allDay('2026-11-03', '2026-11-04'), allDay('2026-11-05', '2026-11-06')];
  const kept = filterEventsForRange([earlyLocal, lateLocal, nextDay, endsAtMidnight, instant, holiday, ...otherHolidays], '2026-11-04', '2026-11-04');
  assert.deepEqual(kept.map(e => e.title), ['early', 'late', 'instant', 'holiday']);
  assert.deepEqual(allDayEventsFor(kept, '2026-11-04').map(e => e.title), ['holiday']);
});

test('midnight splitting: one segment per day, wall-clock minutes', () => {
  const overnight = ev('2026-11-04T21:00:00Z', '2026-11-05T01:00:00Z'); // 22:00 → 02:00 Paris
  const segments = splitTimedEvents([overnight], ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.deepEqual(segments.map(s => [s.day, s.startMin, s.endMin, s.continuesBefore, s.continuesAfter]), [
    ['2026-11-04', 1320, 1440, false, true],
    ['2026-11-05', 0, 120, true, false],
  ]);
  const toMidnight = ev('2026-11-04T22:00:00Z', '2026-11-04T23:00:00Z'); // 23:00 → 00:00
  assert.deepEqual(splitTimedEvents([toMidnight], ['2026-11-04', '2026-11-05']).map(s => [s.day, s.startMin, s.endMin, s.continuesAfter]),
    [['2026-11-04', 1380, 1440, false]]);
  const threeDays = ev('2026-11-04T11:00:00Z', '2026-11-06T09:00:00Z');
  assert.deepEqual(splitTimedEvents([threeDays], ['2026-11-04', '2026-11-05', '2026-11-06']).map(s => [s.startMin, s.endMin]),
    [[720, 1440], [0, 1440], [0, 600]]);
  assert.equal(splitTimedEvents([allDay('2026-11-04', '2026-11-05')], ['2026-11-04']).length, 0, 'all-day events go to the all-day row');
});

test('DST days: 23 h and 25 h, positions stay on wall-clock lines', () => {
  const [springStart, springEnd] = dayBounds('2026-03-29');
  assert.equal((springEnd - springStart) / 3600000, 23);
  const [autumnStart, autumnEnd] = dayBounds('2026-10-25');
  assert.equal((autumnEnd - autumnStart) / 3600000, 25);

  const nine = ev('2026-03-29T07:00:00Z', '2026-03-29T08:00:00Z'); // 09:00 CEST
  assert.deepEqual(splitTimedEvents([nine], ['2026-03-29']).map(s => [s.startMin, s.endMin]), [[540, 600]]);
  const acrossJump = ev('2026-03-29T00:00:00Z', '2026-03-29T02:00:00Z'); // 01:00 CET → 04:00 CEST (2 real hours)
  assert.deepEqual(splitTimedEvents([acrossJump], ['2026-03-29']).map(s => [s.startMin, s.endMin]), [[60, 240]]);
  const nineAutumn = ev('2026-10-25T08:00:00Z', '2026-10-25T09:00:00Z'); // 09:00 CET
  assert.deepEqual(splitTimedEvents([nineAutumn], ['2026-10-25']).map(s => [s.startMin, s.endMin]), [[540, 600]]);
  const repeatedHour = ev('2026-10-25T00:30:00Z', '2026-10-25T01:15:00Z'); // 02:30 CEST → 02:15 CET (45 min)
  assert.deepEqual(splitTimedEvents([repeatedHour], ['2026-10-25']).map(s => [s.startMin, s.endMin]), [[150, 195]]);
  const lateAutumn = ev('2026-10-25T22:00:00Z', '2026-10-26T00:00:00Z'); // 23:00 → 01:00
  assert.deepEqual(splitTimedEvents([lateAutumn], ['2026-10-25', '2026-10-26']).map(s => [s.day, s.startMin, s.endMin]),
    [['2026-10-25', 1380, 1440], ['2026-10-26', 0, 60]]);
});

test('week calculation across DST changes', () => {
  assert.deepEqual(weekOf('2026-03-29'), ['2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29']);
  assert.deepEqual(weekOf('2026-03-23'), weekOf('2026-03-29'));
  assert.deepEqual(weekOf('2026-03-30'), ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05']);
  assert.deepEqual(weekOf('2026-10-25'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(weekOf('2026-10-26')[0], '2026-10-26');
  assert.equal(offsetDay('2026-03-28', 1), '2026-03-29');
  assert.equal(offsetDay('2026-03-29', 1), '2026-03-30');
  assert.equal(offsetDay('2026-10-25', 1), '2026-10-26');
  assert.equal(offsetDay('2026-10-26', -7), '2026-10-19');
  // Between midnight and 1 am in France, UTC is still the previous day.
  const justAfterMidnight = new Date('2026-11-04T23:30:00Z');
  assert.equal(localTodayStr(justAfterMidnight), '2026-11-05');
  assert.equal(justAfterMidnight.toISOString().split('T')[0], '2026-11-04');
});

test('column packing: overlapping clusters share columns, others take full width', () => {
  const placed = packColumns([seg('A', 540, 600), seg('B', 570, 630), seg('C', 600, 660), seg('D', 720, 780)]);
  const byId = Object.fromEntries(placed.map(p => [p.event.id, [p.column, p.columns]]));
  assert.deepEqual(byId, { A: [0, 2], B: [1, 2], C: [0, 2], D: [0, 1] });

  const three = packColumns([seg('X', 600, 720), seg('Y', 630, 690), seg('Z', 660, 700)]);
  assert.deepEqual(three.map(p => [p.event.id, p.column, p.columns]), [['X', 0, 3], ['Y', 1, 3], ['Z', 2, 3]]);

  // Minimum visible height (15 min) counts for layout: 5-min events 10 min apart overlap visually.
  const short = packColumns([seg('S1', 540, 545), seg('S2', 550, 555)]);
  assert.deepEqual(short.map(p => [p.event.id, p.top, p.bottom, p.column, p.columns]), [['S1', 540, 555, 0, 2], ['S2', 550, 565, 1, 2]]);
  // Touching events do not overlap; a late event stays inside the day.
  assert.deepEqual(packColumns([seg('T1', 540, 600), seg('T2', 600, 660)]).map(p => p.columns), [1, 1]);
  assert.deepEqual(packColumns([seg('L', 1435, 1440)]).map(p => [p.top, p.bottom]), [[1425, 1440]]);
});

test('conflicts: only overlaps between different feeds', () => {
  const work = ev('2026-11-04T08:00:00Z', '2026-11-04T09:00:00Z', { feedId: 'work' });
  const personal = ev('2026-11-04T08:30:00Z', '2026-11-04T09:30:00Z', { feedId: 'personal' });
  const work2 = ev('2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z', { feedId: 'work' });
  const work3 = ev('2026-11-04T10:30:00Z', '2026-11-04T11:30:00Z', { feedId: 'work' });
  const touchingA = ev('2026-11-04T12:00:00Z', '2026-11-04T13:00:00Z', { feedId: 'personal' });
  const touchingB = ev('2026-11-04T13:00:00Z', '2026-11-04T14:00:00Z', { feedId: 'work' });
  const holiday = allDay('2026-11-04', '2026-11-05', { feedId: 'personal' });
  const longWork = ev('2026-11-04T15:00:00Z', '2026-11-04T19:00:00Z', { feedId: 'work' });
  const insideLong = ev('2026-11-04T17:00:00Z', '2026-11-04T17:30:00Z', { feedId: 'personal' });
  const all = [work, personal, work2, work3, touchingA, touchingB, holiday, longWork, insideLong];
  assert.deepEqual([...findConflicts(all)].sort(), [work.id, personal.id, longWork.id, insideLong.id].sort());
  assert.deepEqual(conflictsWith(work, all).map(e => e.id), [personal.id]);
  assert.deepEqual(conflictsWith(holiday, all), []);
});

test('formatting, freshness and refresh messages', () => {
  assert.match(formatEventRange(ev('2026-11-04T09:00:00Z', '2026-11-04T10:00:00Z')), /^10:00.11:00$/);
  assert.equal(formatEventRange(allDay('2026-11-04', '2026-11-05')), 'All day');
  assert.match(formatEventRange(allDay('2026-11-04', '2026-11-07')), /^All day, /);
  assert.match(formatEventRange(ev('2026-11-04T21:00:00Z', '2026-11-05T01:00:00Z')), /22:00 .* 02:00/);
  const overnight = ev('2026-11-04T21:00:00Z', '2026-11-05T01:00:00Z');
  assert.match(formatDayRange(overnight, '2026-11-04'), /^22:00.02:00 \(\+1\)$/);
  assert.match(formatDayRange(overnight, '2026-11-05'), /^….02:00$/);
  assert.match(formatDayRange(ev('2026-11-04T22:00:00Z', '2026-11-04T23:00:00Z'), '2026-11-04'), /^23:00.00:00$/, 'ending at midnight stays on the day');
  assert.equal(formatDayRange(allDay('2026-11-04', '2026-11-05'), '2026-11-04'), 'All day');

  const now = Date.parse('2026-11-04T12:00:00Z');
  assert.equal(feedWarning({ status: 'ok', lastSuccessAt: '2026-11-04T11:45:00Z' }, now), null);
  assert.equal(feedWarning({ status: 'ok', lastSuccessAt: '2026-11-04T10:00:00Z' }, now), 'updated 2 h ago');
  assert.equal(feedWarning({ status: 'timeout', lastSuccessAt: '2026-11-04T11:55:00Z' }, now), 'updated 5 min ago');
  assert.equal(feedWarning({ status: 'pending', lastSuccessAt: null }, now), 'not synced yet');
  assert.equal(feedWarning({ status: 'http_error', lastSuccessAt: null }, now), 'sync failed');
  assert.equal(relativeAge(30000), 'just now');
  assert.equal(relativeAge(3 * 86400000), '3 d ago');

  assert.equal(refreshErrorMessage(429), 'Already refreshed');
  assert.equal(refreshErrorMessage(409), 'No calendars configured');
  assert.equal(refreshErrorMessage(500), 'Refresh failed');
  assert.equal(refreshErrorMessage(undefined), 'Refresh failed');
});
