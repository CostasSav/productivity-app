import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import type { CalendarEvent, CalendarFeedInfo, Task } from '../../types';
import { parseDateKey } from '../../utils/date';
import {
  allDayEventsFor, conflictsWith, findConflicts, formatDayRange, formatEventRange, packColumns, splitTimedEvents,
} from '../../utils/calendarLayout';

// Week (7 columns) and Day (1 column) hourly grid. External events are read-only.

const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
const FALLBACK_COLOR = '#6b7280';
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const WORK_START = 8;
const WORK_END = 18;
const OFF_HOURS_CLASS = 'absolute inset-x-0 bg-gray-100/70 dark:bg-white/[0.045] pointer-events-none';

interface CalendarTimeGridProps {
  days: string[];
  today: string;
  events: CalendarEvent[];
  feeds: Record<string, CalendarFeedInfo>;
  tasksByDate: Record<string, Task[]>;
  renderTask: (task: Task) => ReactNode;
  /** Extra props for each day's all-day cell (e.g. drop target for tasks). */
  allDayCellProps?: (day: string) => HTMLAttributes<HTMLDivElement>;
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function eventLabel(event: CalendarEvent, feed: CalendarFeedInfo | undefined, conflict: boolean) {
  return `${feed?.label ?? 'Calendar'}, ${formatEventRange(event)}, ${event.title}${conflict ? ', overlaps another calendar' : ''}`;
}

export function ConflictBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Overlaps an event from another calendar"
      aria-hidden
      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-bold leading-none flex-shrink-0 ${className}`}
    >!</span>
  );
}

interface PopoverState { event: CalendarEvent; rect: DOMRect; trigger: HTMLElement }

function EventPopover({ state, feed, overlapping, feeds, onClose }: {
  state: PopoverState; feed: CalendarFeedInfo | undefined; overlapping: CalendarEvent[];
  feeds: Record<string, CalendarFeedInfo>; onClose: (restoreFocus: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = 272;
  const left = state.rect.right + 8 + width <= window.innerWidth ? state.rect.right + 8 : Math.max(8, state.rect.left - width - 8);
  const top = Math.min(Math.max(8, state.rect.top), window.innerHeight - 220);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(true); };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !state.trigger.contains(e.target as Node)) onClose(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [onClose, state.trigger]);

  const color = feed?.color ?? FALLBACK_COLOR;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={state.event.title}
      tabIndex={-1}
      className="fixed z-50 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-[#111113] shadow-xl p-3 outline-none"
      style={{ left, top, width }}
    >
      <div className="flex items-start gap-2">
        <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{state.event.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{formatEventRange(state.event)}</p>
          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {feed?.label ?? 'Calendar'}
          </p>
          {overlapping.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><ConflictBadge /> Overlaps</p>
              <ul className="mt-1 space-y-0.5">
                {overlapping.slice(0, 4).map(other => (
                  <li key={other.id} className="text-xs text-gray-600 dark:text-gray-300 truncate">
                    {feeds[other.feedId]?.label ?? 'Calendar'} · {formatEventRange(other)} · {other.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={() => onClose(true)}
          aria-label="Close"
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

export function CalendarTimeGrid({ days, today, events, feeds, tasksByDate, renderTask, allDayCellProps }: CalendarTimeGridProps) {
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const conflicts = useMemo(() => findConflicts(events), [events]);
  const placedByDay = useMemo(() => {
    const byDay: Record<string, ReturnType<typeof packColumns>> = {};
    const segments = splitTimedEvents(events, days);
    for (const day of days) byDay[day] = packColumns(segments.filter(s => s.day === day));
    return byDay;
  }, [events, days]);

  // On open: about 1 h before now when today is visible, otherwise 08:00.
  const firstDay = days[0], dayCount = days.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const current = new Date();
    const minutes = days.includes(today) ? current.getHours() * 60 + current.getMinutes() - 60 : 8 * 60;
    el.scrollTop = Math.max(0, minutes) * PX_PER_MIN;
  }, [firstDay, dayCount]); // re-run on navigation only, not on every render

  const openEvent = (event: CalendarEvent, target: HTMLElement) => {
    setPopover(prev => (prev?.event.id === event.id ? null : { event, rect: target.getBoundingClientRect(), trigger: target }));
  };
  const popoverRef = useRef(popover);
  popoverRef.current = popover;
  // Escape / close button return focus to the event; an outside click leaves focus where it went.
  const closePopover = useCallback((restoreFocus: boolean) => {
    if (restoreFocus) popoverRef.current?.trigger.focus();
    setPopover(null);
  }, []);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`;

  const eventStyle = (feedId: string) => {
    const color = feeds[feedId]?.color ?? FALLBACK_COLOR;
    return { backgroundColor: `${color}2e`, borderLeft: `3px solid ${color}` };
  };

  return (
    <div className="flex-1 overflow-x-auto min-h-0">
      <div className={`flex flex-col border border-gray-200 dark:border-zinc-800/60 rounded-lg bg-white dark:bg-[#09090b] ${days.length > 1 ? 'min-w-[720px]' : ''}`}>

        {/* Day headers */}
        <div className="grid border-b border-gray-200 dark:border-zinc-800/60" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map(day => {
            const d = parseDateKey(day);
            const isToday = day === today;
            return (
              <div key={day} className="py-2 text-center border-l border-gray-100 dark:border-zinc-800/60">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 mr-1">
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className={`inline-flex items-center justify-center text-xs font-semibold font-mono w-6 h-6 rounded-full
                  ${isToday ? 'bg-teal-600 text-white' : day < today ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-day row: all-day events + tasks due that day */}
        <div className="grid border-b border-gray-200 dark:border-zinc-800/60" style={{ gridTemplateColumns: columns }}>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 text-right pr-2 pt-1.5">all-day</div>
          {days.map(day => {
            const allDay = allDayEventsFor(events, day);
            const dayTasks = tasksByDate[day] ?? [];
            return (
              <div key={day} {...allDayCellProps?.(day)}
                className={`min-h-[36px] max-h-28 overflow-y-auto p-1 space-y-0.5 border-l border-gray-100 dark:border-zinc-800/60 ${allDayCellProps?.(day).className ?? ''}`}>
                {allDay.map(event => (
                  <button
                    key={event.id}
                    onClick={e => openEvent(event, e.currentTarget)}
                    aria-label={eventLabel(event, feeds[event.feedId], false)}
                    aria-haspopup="dialog"
                    className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-gray-800 dark:text-gray-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                    style={eventStyle(event.feedId)}
                  >
                    {event.title}
                  </button>
                ))}
                {dayTasks.map(task => renderTask(task))}
              </div>
            );
          })}
        </div>

        {/* Hourly body */}
        <div ref={scrollRef} className="overflow-y-auto relative" style={{ height: 'max(360px, calc(100vh - 22rem))' }}>
          <div className="grid relative" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
            {/* Hour labels */}
            <div className="relative">
              {HOURS.map(h => h > 0 && (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] font-mono text-gray-400 dark:text-gray-500" style={{ top: h * HOUR_PX }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>

            {days.map(day => (
              <div key={day} className={`relative border-l border-gray-100 dark:border-zinc-800/60 ${day === today ? 'bg-teal-50/30 dark:bg-teal-900/5' : ''}`}>
                {/* Non-working time (before 08:00, after 18:00, weekends) is lightly shaded, as in Teams */}
                {[0, 6].includes(parseDateKey(day).getDay()) ? (
                  <div className={OFF_HOURS_CLASS} style={{ top: 0, height: 24 * HOUR_PX }} aria-hidden />
                ) : (<>
                  <div className={OFF_HOURS_CLASS} style={{ top: 0, height: WORK_START * HOUR_PX }} aria-hidden />
                  <div className={OFF_HOURS_CLASS} style={{ top: WORK_END * HOUR_PX, height: (24 - WORK_END) * HOUR_PX }} aria-hidden />
                </>)}

                {/* Hour and 30-min gridlines */}
                {HOURS.map(h => (
                  <div key={h} className={`absolute inset-x-0 border-t ${h === WORK_START || h === WORK_END ? 'border-gray-300 dark:border-zinc-600' : 'border-gray-100 dark:border-zinc-800/60'}`} style={{ top: h * HOUR_PX, height: HOUR_PX }}>
                    <div className="absolute inset-x-0 border-t border-dashed border-gray-100/70 dark:border-zinc-800/40" style={{ top: HOUR_PX / 2 }} />
                  </div>
                ))}

                {placedByDay[day]?.map(placed => {
                  const { event } = placed;
                  const conflict = conflicts.has(event.id);
                  const height = (placed.bottom - placed.top) * PX_PER_MIN;
                  const compact = height < 34;
                  return (
                    <button
                      key={`${event.id}-${day}`}
                      onClick={e => openEvent(event, e.currentTarget)}
                      aria-label={eventLabel(event, feeds[event.feedId], conflict)}
                      aria-haspopup="dialog"
                      className={`absolute overflow-hidden text-left rounded-sm px-1.5 text-gray-800 dark:text-gray-100 cursor-pointer hover:z-10 hover:shadow-md
                        focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500
                        ${placed.continuesBefore ? 'rounded-t-none' : ''} ${placed.continuesAfter ? 'rounded-b-none' : ''}
                        ${conflict ? 'ring-1 ring-amber-400/70' : ''} ${compact ? 'py-0' : 'py-0.5'}`}
                      style={{
                        ...eventStyle(event.feedId),
                        top: placed.top * PX_PER_MIN,
                        height: Math.max(height - 1, 10),
                        left: `calc(${(placed.column / placed.columns) * 100}% + 2px)`,
                        width: `calc(${100 / placed.columns}% - 4px)`,
                      }}
                    >
                      <span className="flex items-start gap-1">
                        <span className={`flex-1 min-w-0 text-[11px] leading-tight ${compact ? 'truncate' : 'line-clamp-2'} font-medium`}>
                          {event.title}
                          {compact && <span className="font-normal opacity-70"> · {formatDayRange(event, day).split('–')[0]}</span>}
                        </span>
                        {conflict && <ConflictBadge className="mt-px" />}
                      </span>
                      {!compact && <span className="block text-[10px] leading-tight opacity-70 truncate">{formatDayRange(event, day)}</span>}
                    </button>
                  );
                })}

                {/* Now line */}
                {day === today && (
                  <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: nowMinutes * PX_PER_MIN }} aria-hidden>
                    <div className="relative border-t-2 border-red-500">
                      <span className="absolute -left-1 -top-[5px] w-2 h-2 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {popover && (
        <EventPopover
          state={popover}
          feed={feeds[popover.event.feedId]}
          overlapping={conflictsWith(popover.event, events)}
          feeds={feeds}
          onClose={closePopover}
        />
      )}
    </div>
  );
}
