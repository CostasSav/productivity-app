import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type {
  PlanningSummary, PlanningDetail, PlanningGroup, PlanningItem, PlanningSegment, PlanningUpdate, PlanningGroupUpdate,
  PlanningItemUpdate, PlanningSegmentInput, PlanningGroupDeleteMode, PlanningReorder,
} from '../types';

// ── Shared keys ───────────────────────────────────────────────────────────────

const LIST_KEY = queryKeys.plannings;
// Every detail mutation shares this key so onSettled can tell when the last
// one of a burst (e.g. a bar drag) has landed.
const DETAIL_MUTATION_KEY = ['plannings', 'detail-mutation'] as const;
const FALLBACK_COLOR = '#22c55e';

// Optimistically created groups/items get negative ids until the server answers.
// Callers should not fire follow-up mutations on an entity whose id is < 0.
let nextTempId = -1;

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePlanningsList() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api.plannings.list(),
  });
}

export function usePlanning(id: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.planning(id ?? 0),
    queryFn: () => api.plannings.get(id!),
    enabled: id != null,
  });
}

// ── Shared optimistic plumbing for everything inside one planning ────────────

interface DetailVars { planningId: number }

function useDetailMutation<V extends DetailVars, R>(options: {
  mutationFn: (vars: V) => Promise<R>;
  apply: (detail: PlanningDetail, vars: V, tempId: number) => PlanningDetail;
  // Swap a temporary entity for the server's as soon as it exists.
  reconcile?: (detail: PlanningDetail, result: R, tempId: number) => PlanningDetail;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: DETAIL_MUTATION_KEY,
    mutationFn: options.mutationFn,

    onMutate: async (vars: V) => {
      const key = queryKeys.planning(vars.planningId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanningDetail>(key);
      const tempId = nextTempId--;
      if (previous) queryClient.setQueryData<PlanningDetail>(key, options.apply(previous, vars, tempId));
      return { previous, tempId };
    },

    onSuccess: (result, vars, ctx) => {
      if (!options.reconcile || !ctx) return;
      queryClient.setQueryData<PlanningDetail>(queryKeys.planning(vars.planningId), prev =>
        prev ? options.reconcile!(prev, result, ctx.tempId) : prev
      );
    },

    onError: (_err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.planning(vars.planningId), ctx.previous);
    },

    onSettled: (_data, _err, vars) => {
      // Refetch only after the last in-flight mutation, so an early response
      // never overwrites newer optimistic state while the user keeps dragging.
      if (queryClient.isMutating({ mutationKey: DETAIL_MUTATION_KEY }) === 1) {
        queryClient.invalidateQueries({ queryKey: queryKeys.planning(vars.planningId) });
      }
    },
  });
}

function mapItem(detail: PlanningDetail, itemId: number, fn: (item: PlanningItem) => PlanningItem): PlanningDetail {
  return { ...detail, items: detail.items.map(i => (i.id === itemId ? fn(i) : i)) };
}
function sortByOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}
/** Mirrors the server: root-level groups and items share one ordering space. */
function nextOrder(detail: PlanningDetail, groupId: number | null): number {
  const orders = detail.items.filter(i => i.groupId === groupId).map(i => i.order);
  if (groupId === null) orders.push(...detail.groups.map(g => g.order));
  return orders.length ? Math.max(...orders) + 1 : 0;
}
const defaultColor = (detail: PlanningDetail) => detail.legend[0]?.color ?? FALLBACK_COLOR;

// ── Plannings ─────────────────────────────────────────────────────────────────

export function useCreatePlanning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; sectionId?: number | null; startDate?: string; targetDate?: string | null }) =>
      api.plannings.create(data),
    onSuccess: (detail) => {
      // The import is computed server-side, so seed the detail cache from the response.
      queryClient.setQueryData(queryKeys.planning(detail.id), detail);
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
    },
  });
}

export function useUpdatePlanning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: DETAIL_MUTATION_KEY,
    mutationFn: ({ id, data }: { id: number; data: PlanningUpdate }) => api.plannings.update(id, data),

    onMutate: async ({ id, data }) => {
      const key = queryKeys.planning(id);
      await queryClient.cancelQueries({ queryKey: key });
      await queryClient.cancelQueries({ queryKey: LIST_KEY, exact: true });
      const previousDetail = queryClient.getQueryData<PlanningDetail>(key);
      const previousList = queryClient.getQueryData<PlanningSummary[]>(LIST_KEY);
      if (previousDetail) queryClient.setQueryData<PlanningDetail>(key, { ...previousDetail, ...data });
      queryClient.setQueryData<PlanningSummary[]>(LIST_KEY, prev => prev?.map(p => (p.id === id ? { ...p, ...data } : p)));
      return { previousDetail, previousList };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previousDetail) queryClient.setQueryData(queryKeys.planning(id), ctx.previousDetail);
      if (ctx?.previousList) queryClient.setQueryData(LIST_KEY, ctx.previousList);
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
      if (queryClient.isMutating({ mutationKey: DETAIL_MUTATION_KEY }) === 1) {
        queryClient.invalidateQueries({ queryKey: queryKeys.planning(id) });
      }
    },
  });
}

export function useDeletePlanning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.plannings.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const previous = queryClient.getQueryData<PlanningSummary[]>(LIST_KEY);
      queryClient.setQueryData<PlanningSummary[]>(LIST_KEY, prev => prev?.filter(p => p.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(LIST_KEY, ctx.previous);
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.planning(id) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true });
    },
  });
}

/** Bulk reorder / regroup in one atomic request (drag & drop of rows). */
export function useReorderPlanning() {
  return useDetailMutation({
    mutationFn: ({ planningId, ...data }: DetailVars & PlanningReorder) => api.plannings.reorder(planningId, data),
    apply: (detail, { groups = [], items = [] }) => {
      const groupMoves = new Map(groups.map(g => [g.id, g]));
      const itemMoves = new Map(items.map(i => [i.id, i]));
      return {
        ...detail,
        groups: sortByOrder(detail.groups.map(g => (groupMoves.has(g.id) ? { ...g, order: groupMoves.get(g.id)!.order } : g))),
        items: sortByOrder(detail.items.map(i => {
          const move = itemMoves.get(i.id);
          return move ? { ...i, order: move.order, groupId: move.groupId } : i;
        })),
      };
    },
  });
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function useCreatePlanningGroup() {
  return useDetailMutation({
    mutationFn: ({ planningId, name, collapsed }: DetailVars & { name: string; collapsed?: boolean }) =>
      api.planningGroups.create({ planningId, name, collapsed }),
    apply: (detail, { planningId, name, collapsed }, tempId) => ({
      ...detail,
      groups: [...detail.groups, { id: tempId, planningId, name, collapsed: collapsed ?? false, order: nextOrder(detail, null) }],
    }),
    reconcile: (detail, group: PlanningGroup, tempId) => ({
      ...detail,
      groups: detail.groups.map(g => (g.id === tempId ? group : g)),
    }),
  });
}

export function useUpdatePlanningGroup() {
  return useDetailMutation({
    mutationFn: ({ id, data }: DetailVars & { id: number; data: PlanningGroupUpdate }) => api.planningGroups.update(id, data),
    apply: (detail, { id, data }) => ({
      ...detail,
      groups: sortByOrder(detail.groups.map(g => (g.id === id ? { ...g, ...data } : g))),
    }),
  });
}

export function useDeletePlanningGroup() {
  return useDetailMutation({
    mutationFn: ({ id, mode }: DetailVars & { id: number; mode: PlanningGroupDeleteMode }) => api.planningGroups.delete(id, mode),
    apply: (detail, { id, mode }) => {
      const groups = detail.groups.filter(g => g.id !== id);
      if (mode === 'deleteItems') return { ...detail, groups, items: detail.items.filter(i => i.groupId !== id) };
      let order = nextOrder(detail, null);
      const moved = new Map(sortByOrder(detail.items.filter(i => i.groupId === id)).map(i => [i.id, order++]));
      return {
        ...detail,
        groups,
        items: sortByOrder(detail.items.map(i => (moved.has(i.id) ? { ...i, groupId: null, order: moved.get(i.id)! } : i))),
      };
    },
  });
}

// ── Items ─────────────────────────────────────────────────────────────────────

export function useCreatePlanningItem() {
  return useDetailMutation({
    mutationFn: ({ planningId, data }: DetailVars & { data: PlanningItemUpdate }) =>
      api.planningItems.create({ ...data, planningId }),
    apply: (detail, { planningId, data }, tempId) => {
      const groupId = data.groupId ?? null;
      const item: PlanningItem = {
        id: tempId, planningId, groupId, taskId: data.taskId ?? null, subtaskId: data.subtaskId ?? null,
        title: data.title ?? '', owner: data.owner ?? null, progress: data.progress ?? 0,
        order: nextOrder(detail, groupId), segments: data.segments ?? [],
      };
      return { ...detail, items: [...detail.items, item] };
    },
    reconcile: (detail, item: PlanningItem, tempId) => ({
      ...detail,
      items: detail.items.map(i => (i.id === tempId ? item : i)),
    }),
  });
}

export function useUpdatePlanningItem() {
  return useDetailMutation({
    mutationFn: ({ id, data }: DetailVars & { id: number; data: PlanningItemUpdate }) => api.planningItems.update(id, data),
    apply: (detail, { id, data }) => {
      const moved = mapItem(detail, id, item => {
        const next = { ...item, ...data };
        if (data.taskId === null) next.subtaskId = null;
        // Moving to another group without an explicit order appends, like the server.
        if (data.groupId !== undefined && data.groupId !== item.groupId && data.order === undefined) {
          next.order = nextOrder(detail, data.groupId);
        }
        return next;
      });
      return { ...moved, items: sortByOrder(moved.items) };
    },
  });
}

export function useDeletePlanningItem() {
  return useDetailMutation({
    mutationFn: ({ id }: DetailVars & { id: number }) => api.planningItems.delete(id),
    apply: (detail, { id }) => ({ ...detail, items: detail.items.filter(i => i.id !== id) }),
  });
}

// ── Segments ──────────────────────────────────────────────────────────────────
// Pass an id from newSegmentId() (utils/planning) so the bar keeps its identity.

export function useAddPlanningSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segment }: DetailVars & { itemId: number; segment: PlanningSegmentInput & { id: string } }) =>
      api.planningItems.addSegment(itemId, segment),
    apply: (detail, { itemId, segment }) =>
      mapItem(detail, itemId, item => ({
        ...item,
        segments: [...item.segments, { ...segment, color: segment.color ?? defaultColor(detail) }],
      })),
  });
}

export function useUpdatePlanningSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segmentId, data }: DetailVars & { itemId: number; segmentId: string; data: Partial<Omit<PlanningSegment, 'id'>> }) =>
      api.planningItems.updateSegment(itemId, segmentId, data),
    apply: (detail, { itemId, segmentId, data }) =>
      mapItem(detail, itemId, item => ({
        ...item,
        segments: item.segments.map(s => (s.id === segmentId ? { ...s, ...data } : s)),
      })),
  });
}

export function useDeletePlanningSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segmentId }: DetailVars & { itemId: number; segmentId: string }) =>
      api.planningItems.deleteSegment(itemId, segmentId),
    apply: (detail, { itemId, segmentId }) =>
      mapItem(detail, itemId, item => ({ ...item, segments: item.segments.filter(s => s.id !== segmentId) })),
  });
}
