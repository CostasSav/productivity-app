import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { Section } from '../types';

// ── Shared key ────────────────────────────────────────────────────────────────

const SECTION_KEY = queryKeys.sections;

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      api.sections.create({ name, color }),
    onSuccess: () => {
      // A new section needs a server-generated ID, so we just invalidate.
      queryClient.invalidateQueries({ queryKey: SECTION_KEY });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Pick<Section, 'name' | 'color'>> }) =>
      api.sections.update(id, data),

    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: SECTION_KEY });
      const previous = queryClient.getQueryData<Section[]>(SECTION_KEY);
      queryClient.setQueryData<Section[]>(SECTION_KEY, prev =>
        (prev ?? []).map(s => (s.id === id ? { ...s, ...data } : s))
      );
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(SECTION_KEY, ctx.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SECTION_KEY });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.sections.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: SECTION_KEY });
      const previous = queryClient.getQueryData<Section[]>(SECTION_KEY);
      queryClient.setQueryData<Section[]>(SECTION_KEY, prev =>
        (prev ?? []).filter(s => s.id !== id)
      );
      return { previous };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(SECTION_KEY, ctx.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: SECTION_KEY });
    },
  });
}

// ── Composite hook (used by all callers: App, Today, Habits, SectionPage) ────
// Returns the same interface as the old useState-based hook so all consumers
// work without any changes.

export function useSections() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SECTION_KEY,
    queryFn: () => api.sections.list(),
  });

  const createMutation = useCreateSection();
  const updateMutation = useUpdateSection();
  const deleteMutation = useDeleteSection();

  const sections = query.data ?? [];
  const loading = query.isLoading;

  const createSection = (name: string, color: string): Promise<Section> =>
    createMutation.mutateAsync({ name, color });

  const updateSection = (
    id: number,
    data: Partial<Pick<Section, 'name' | 'color'>>,
  ): Promise<Section> => updateMutation.mutateAsync({ id, data });

  const deleteSection = (id: number): Promise<void> =>
    deleteMutation.mutateAsync(id);

  const reload = () => queryClient.invalidateQueries({ queryKey: SECTION_KEY });

  return { sections, loading, createSection, updateSection, deleteSection, reload };
}
