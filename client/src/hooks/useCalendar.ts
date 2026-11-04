import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { ApiError } from '../api/request';
import { fetchCalendarEvents } from '../api/calendar';
import { queryKeys } from '../lib/queryKeys';
import { filterEventsForRange, paddedRange, refreshErrorMessage } from '../utils/calendarLayout';
import type { CalendarEvent, CalendarFeedInfo } from '../types';

/** Visible local days, inclusive. null = no external events needed (e.g. Month view). */
export type CalendarRange = { first: string; last: string } | null;

export function useCalendarEvents(range: CalendarRange) {
  const fetchRange = range ? paddedRange(range.first, range.last) : null;
  const query = useQuery({
    queryKey: queryKeys.calendarEvents(fetchRange?.from ?? '', fetchRange?.to ?? ''),
    // Never throws for a missing/broken calendar API (deploy order): see fetchCalendarEvents.
    queryFn: () => fetchCalendarEvents(fetchRange!.from, fetchRange!.to),
    enabled: fetchRange !== null,
    staleTime: 2 * 60000,
    // No polling while unavailable; a later focus or navigation checks again.
    refetchInterval: query => (query.state.data?.unavailable ? false : 5 * 60000),
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const first = range?.first, last = range?.last;
  // enabled:false → no events and no legend.
  const events = useMemo<CalendarEvent[]>(
    () => (data?.enabled && first && last ? filterEventsForRange(data.events, first, last) : []),
    [data, first, last],
  );
  const feeds: CalendarFeedInfo[] = data?.enabled ? data.feeds : [];
  return { events, feeds, enabled: !!data?.enabled, isLoading: query.isLoading, isError: query.isError };
}

export function useRefreshCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.calendar.refresh(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.calendar }),
  });
}

export function refreshMessage(error: unknown): string {
  return refreshErrorMessage(error instanceof ApiError ? error.status : undefined);
}
