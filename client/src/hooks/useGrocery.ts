import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { GroceryItem, GroceryStaple } from '../types';

// ── Shared keys (exported so Grocery.jsx can write to the cache directly) ─────

export const GROCERY_KEY  = queryKeys.grocery;
export const STAPLES_KEY  = queryKeys.groceryStaples;

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useAddGroceryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; quantity?: number; unit?: string; category?: string; note?: string }) =>
      api.grocery.add(data),
    onSuccess: (item) => {
      queryClient.setQueryData<GroceryItem[]>(GROCERY_KEY, prev =>
        [...(prev ?? []), item]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: GROCERY_KEY });
    },
  });
}

// ── Composite hook (used by Grocery page and Today view) ──────────────────────
// The Grocery page does its own optimistic cache manipulation (drag-to-reorder,
// undo-able clear-checked) using useQueryClient() + the exported key constants.
// This hook just provides the queries and the addItem mutation used by Today.

export function useGrocery() {
  const itemsQuery   = useQuery({ queryKey: GROCERY_KEY,  queryFn: () => api.grocery.list() });
  const staplesQuery = useQuery({ queryKey: STAPLES_KEY,  queryFn: () => api.groceryStaples.list() });
  const addMutation  = useAddGroceryItem();

  return {
    items:          itemsQuery.data   ?? [] as GroceryItem[],
    staples:        staplesQuery.data ?? [] as GroceryStaple[],
    loading:        itemsQuery.isLoading,
    staplesLoading: staplesQuery.isLoading,
    addItemPending: addMutation.isPending,
    addItem:        (data: { name: string; quantity?: number; unit?: string; category?: string; note?: string }): Promise<GroceryItem> =>
      addMutation.mutateAsync(data),
  };
}
