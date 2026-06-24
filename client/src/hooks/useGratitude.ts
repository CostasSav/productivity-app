import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { GratitudeEntry, GratitudeSettings } from '../types';

// ── Shared keys ───────────────────────────────────────────────────────────────

const GRATITUDE_LIST_KEY     = queryKeys.gratitude;
const GRATITUDE_TODAY_KEY    = queryKeys.gratitudeToday;
const GRATITUDE_SETTINGS_KEY = queryKeys.gratitudeSettings;

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveData = {
  items: string[];
  mood: number | null;
  durationSeconds: number;
  completedAt?: string;
};

type SettingsUpdate = Partial<{
  reminderEnabled: boolean;
  reminderTime: string;
  onboardingComplete: boolean;
  resetStreak: boolean;
}>;

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useSaveGratitude() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveData) => api.gratitude.save(data),
    onSuccess: (entry) => {
      queryClient.setQueryData<GratitudeEntry | null>(GRATITUDE_TODAY_KEY, entry);
      queryClient.setQueryData<GratitudeEntry[]>(GRATITUDE_LIST_KEY, prev => {
        if (!prev) return [entry];
        return [entry, ...prev.filter(e => e.date !== entry.date)];
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GRATITUDE_LIST_KEY });
      queryClient.invalidateQueries({ queryKey: GRATITUDE_TODAY_KEY });
    },
  });
}

export function useUpdateGratitudeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsUpdate) => api.gratitudeSettings.update(data),
    onSuccess: (settings) => {
      queryClient.setQueryData(GRATITUDE_SETTINGS_KEY, settings);
    },
  });
}

// ── Composite hook (used by Gratitude page and Today view) ───────────────────

export function useGratitude() {
  const todayQuery = useQuery({
    queryKey: GRATITUDE_TODAY_KEY,
    queryFn: () => api.gratitude.today(),
  });

  const listQuery = useQuery({
    queryKey: GRATITUDE_LIST_KEY,
    queryFn: () => api.gratitude.list(),
  });

  const settingsQuery = useQuery({
    queryKey: GRATITUDE_SETTINGS_KEY,
    queryFn: () => api.gratitudeSettings.get(),
    staleTime: 5 * 60_000, // settings rarely change
  });

  const saveMutation           = useSaveGratitude();
  const updateSettingsMutation = useUpdateGratitudeSettings();

  const loading = todayQuery.isLoading || listQuery.isLoading || settingsQuery.isLoading;

  return {
    // undefined = still loading (matches original useState(undefined) initial value)
    // null      = loaded, no entry today
    // entry     = loaded, has an entry
    todayEntry: todayQuery.data as GratitudeEntry | null | undefined,
    allEntries: listQuery.data ?? [],
    settings:   settingsQuery.data ?? null,
    loading,
    saveGratitude:  (data: SaveData): Promise<GratitudeEntry> =>
      saveMutation.mutateAsync(data),
    updateSettings: (data: SettingsUpdate): Promise<GratitudeSettings> =>
      updateSettingsMutation.mutateAsync(data),
  };
}
