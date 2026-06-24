import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { SleepEntry, SleepSettings, SleepStats } from '../types';

// ── Shared keys ───────────────────────────────────────────────────────────────

const SLEEP_LIST_KEY     = queryKeys.sleep;
const SLEEP_STATS_KEY    = queryKeys.sleepStats;
const SLEEP_SETTINGS_KEY = queryKeys.sleepSettings;

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveSleepData = {
  date: string;
  bedtime: string;
  wakeTime: string;
  quality: number;
  energy: number;
  note?: string | null;
};

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useSaveSleep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveSleepData) => api.sleep.save(data),
    onSuccess: (entry) => {
      // Replace or insert the saved entry in the list cache (sorted newest-first).
      queryClient.setQueryData<SleepEntry[]>(SLEEP_LIST_KEY, prev => {
        const without = (prev ?? []).filter(e => e.date !== entry.date);
        return [entry, ...without].sort((a, b) => b.date.localeCompare(a.date));
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SLEEP_LIST_KEY });
      queryClient.invalidateQueries({ queryKey: SLEEP_STATS_KEY });
    },
  });
}

export function useGenerateSleepInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.sleep.generateInsight(),
    onSuccess: (result) => {
      queryClient.setQueryData<SleepSettings>(SLEEP_SETTINGS_KEY, prev =>
        prev
          ? { ...prev, aiInsightText: result.text, aiInsightLastGenerated: result.generatedAt }
          : prev
      );
    },
  });
}

// ── Composite hook (used by Sleep page and Today view) ────────────────────────

export function useSleep() {
  const listQuery     = useQuery({ queryKey: SLEEP_LIST_KEY,     queryFn: () => api.sleep.list() });
  const statsQuery    = useQuery({ queryKey: SLEEP_STATS_KEY,    queryFn: () => api.sleep.stats(),       staleTime: 60_000 });
  const settingsQuery = useQuery({ queryKey: SLEEP_SETTINGS_KEY, queryFn: () => api.sleepSettings.get(), staleTime: 5 * 60_000 });

  const saveMutation    = useSaveSleep();
  const insightMutation = useGenerateSleepInsight();

  const entries: SleepEntry[] = listQuery.data ?? [];

  // Build a date→entry map once per render so callers can do O(1) lookups.
  const entriesMap: Record<string, SleepEntry> = {};
  for (const e of entries) entriesMap[e.date] = e;

  const loading = listQuery.isLoading || statsQuery.isLoading || settingsQuery.isLoading;

  return {
    entries,
    entriesMap,
    stats:             statsQuery.data    ?? null,
    settings:          settingsQuery.data ?? null,
    loading,
    insightGenerating: insightMutation.isPending,
    saveSleep:         (data: SaveSleepData): Promise<SleepEntry> =>
      saveMutation.mutateAsync(data),
    generateInsight:   (): Promise<{ text: string; generatedAt: string }> =>
      insightMutation.mutateAsync(),
  };
}
