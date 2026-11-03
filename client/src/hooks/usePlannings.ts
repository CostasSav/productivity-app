import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type {
  PlanningSummary, PlanningDetail, PlanningGroup, PlanningItem, PlanningSegment, PlanningUpdate, PlanningGroupUpdate,
  PlanningItemUpdate, PlanningSegmentInput, PlanningGroupDeleteMode, PlanningReorder, PlanningImportEntry, Task,
} from '../types';
import { lastSegmentEnd, syncedDeadline } from '../utils/planning';

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
  // Deletions can add to ignoredTaskIds server-side, which changes missing tasks.
  refreshMissingTasks?: boolean;
  /**
   * Mirrors, on the tasks cache, what the server will do to a linked task in the
   * same request (deadline sync, rename). Returns true when a task is affected:
   * the tasks cache is then rolled back on error and refetched when settled.
   */
  patchTasks?: (tasks: TasksPatcher, before: PlanningDetail, after: PlanningDetail, vars: V) => boolean;
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
      let previousTasks: Task[] | undefined;
      let touchesTasks = false;
      if (previous) {
        const next = options.apply(previous, vars, tempId);
        queryClient.setQueryData<PlanningDetail>(key, next);
        if (options.patchTasks) {
          await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
          previousTasks = queryClient.getQueryData<Task[]>(queryKeys.tasks);
          touchesTasks = options.patchTasks(tasksPatcher(queryClient), previous, next, vars);
        }
      }
      return { previous, tempId, previousTasks, touchesTasks };
    },

    onSuccess: (result, vars, ctx) => {
      if (!options.reconcile || !ctx) return;
      queryClient.setQueryData<PlanningDetail>(queryKeys.planning(vars.planningId), prev =>
        prev ? options.reconcile!(prev, result, ctx.tempId) : prev
      );
    },

    onError: (_err, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.planning(vars.planningId), ctx.previous);
      if (ctx?.touchesTasks && ctx.previousTasks) queryClient.setQueryData(queryKeys.tasks, ctx.previousTasks);
    },

    onSettled: (_data, _err, vars, ctx) => {
      // Tasks page, section page and calendar all read this cache.
      if (ctx?.touchesTasks) queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      if (options.refreshMissingTasks) queryClient.invalidateQueries({ queryKey: queryKeys.planningMissingTasks(vars.planningId) });
      // Refetch only after the last in-flight mutation, so an early response
      // never overwrites newer optimistic state while the user keeps dragging.
      if (queryClient.isMutating({ mutationKey: DETAIL_MUTATION_KEY }) === 1) {
        queryClient.invalidateQueries({ queryKey: queryKeys.planning(vars.planningId) });
      }
    },
  });
}

/** Optimistic edits of the tasks cache made on behalf of planning actions. */
export interface TasksPatcher {
  get(taskId: number): Task | undefined;
  patch(taskId: number, fields: Partial<Task>): void;
  patchSubtaskTitle(taskId: number, subtaskId: number, title: string): void;
}

function tasksPatcher(queryClient: QueryClient): TasksPatcher {
  const update = (fn: (t: Task) => Task, taskId: number) =>
    queryClient.setQueryData<Task[]>(queryKeys.tasks, prev => prev?.map(t => (t.id === taskId ? fn(t) : t)));
  return {
    get: taskId => queryClient.getQueryData<Task[]>(queryKeys.tasks)?.find(t => t.id === taskId),
    patch: (taskId, fields) => update(t => ({ ...t, ...fields }), taskId),
    patchSubtaskTitle: (taskId, subtaskId, title) =>
      update(t => ({ ...t, subtasks: t.subtasks.map(s => (s.id === subtaskId ? { ...s, title } : s)) }), taskId),
  };
}

/** Optimistic deadline sync for one item whose segments changed (same rule as the server). */
function patchDeadline(tasks: TasksPatcher, before: PlanningDetail, after: PlanningDetail, itemId: number, enabled = true): boolean {
  const was = before.items.find(i => i.id === itemId);
  const now = after.items.find(i => i.id === itemId);
  if (!enabled || !was || !now || now.taskId === null || now.subtaskId !== null) return false;
  const task = tasks.get(now.taskId);
  if (!task) return false;
  const to = syncedDeadline(task.deadline, lastSegmentEnd(was.segments), lastSegmentEnd(now.segments));
  if (to !== undefined) tasks.patch(task.id, { deadline: to });
  return true;
}

/** Any task change can move a task in or out of a section: refresh every planning's list. */
export function invalidateAllMissingTasks(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.planningMissingTasksAll });
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
      queryClient.removeQueries({ queryKey: queryKeys.planningMissingTasks(id) });
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
      groups: [...detail.groups, { id: tempId, planningId, taskId: null, name, collapsed: collapsed ?? false, order: nextOrder(detail, null) }],
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
    patchTasks: (tasks, before, _after, { id, data }) => {
      const group = before.groups.find(g => g.id === id);
      if (data.name === undefined || !group || group.taskId === null || !tasks.get(group.taskId)) return false;
      tasks.patch(group.taskId, { title: data.name });
      return true;
    },
    apply: (detail, { id, data }) => ({
      ...detail,
      groups: sortByOrder(detail.groups.map(g => (g.id === id ? { ...g, ...data } : g))),
    }),
  });
}

export function useDeletePlanningGroup() {
  return useDetailMutation({
    mutationFn: ({ id, mode }: DetailVars & { id: number; mode: PlanningGroupDeleteMode }) => api.planningGroups.delete(id, mode),
    refreshMissingTasks: true,
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
        title: data.title ?? '', owner: data.owner ?? null, progress: data.progress ?? 0, progressBeforeDone: null,
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
    // Renaming a linked item renames its task (or subtask) on the server too.
    patchTasks: (tasks, before, _after, { id, data }) => {
      const item = before.items.find(i => i.id === id);
      if (data.title === undefined || !item || item.taskId === null || !tasks.get(item.taskId)) return false;
      if (item.subtaskId !== null) tasks.patchSubtaskTitle(item.taskId, item.subtaskId, data.title);
      else tasks.patch(item.taskId, { title: data.title });
      return true;
    },
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
    refreshMissingTasks: true,
    apply: (detail, { id }) => ({ ...detail, items: detail.items.filter(i => i.id !== id) }),
  });
}

// ── Segments ──────────────────────────────────────────────────────────────────
// Pass an id from newSegmentId() (utils/planning) so the bar keeps its identity.

export function useAddPlanningSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segment, syncDeadline }: DetailVars & { itemId: number; segment: PlanningSegmentInput & { id: string }; syncDeadline?: boolean }) =>
      api.planningItems.addSegment(itemId, { ...segment, ...(syncDeadline === false && { syncDeadline }) }),
    patchTasks: (tasks, before, after, { itemId, syncDeadline }) => patchDeadline(tasks, before, after, itemId, syncDeadline !== false),
    apply: (detail, { itemId, segment }) =>
      mapItem(detail, itemId, item => ({
        ...item,
        segments: [...item.segments, { ...segment, color: segment.color ?? defaultColor(detail) }],
      })),
  });
}

export function useUpdatePlanningSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segmentId, data, syncDeadline }: DetailVars & { itemId: number; segmentId: string; data: Partial<Omit<PlanningSegment, 'id'>>; syncDeadline?: boolean }) =>
      api.planningItems.updateSegment(itemId, segmentId, { ...data, ...(syncDeadline === false && { syncDeadline }) }),
    patchTasks: (tasks, before, after, { itemId, syncDeadline }) => patchDeadline(tasks, before, after, itemId, syncDeadline !== false),
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
    patchTasks: (tasks, before, after, { itemId }) => patchDeadline(tasks, before, after, itemId),
    apply: (detail, { itemId, segmentId }) =>
      mapItem(detail, itemId, item => ({ ...item, segments: item.segments.filter(s => s.id !== segmentId) })),
  });
}

/** Undo of a synced segment change: restores the segment and the task's previous deadline. */
export function useRevertSegment() {
  return useDetailMutation({
    mutationFn: ({ itemId, segmentId, segment, deadline }: DetailVars & { itemId: number; segmentId: string; segment: PlanningSegment | null; deadline: string | null }) =>
      api.planningItems.revertSegment(itemId, { segmentId, segment, deadline }),
    apply: (detail, { itemId, segmentId, segment }) =>
      mapItem(detail, itemId, item => ({
        ...item,
        segments: segment === null
          ? item.segments.filter(s => s.id !== segmentId)
          : item.segments.some(s => s.id === segmentId)
            ? item.segments.map(s => (s.id === segmentId ? segment : s))
            : [...item.segments, segment],
      })),
    patchTasks: (tasks, before, _after, { itemId, deadline }) => {
      const item = before.items.find(i => i.id === itemId);
      if (!item || item.taskId === null || item.subtaskId !== null || !tasks.get(item.taskId)) return false;
      tasks.patch(item.taskId, { deadline });
      return true;
    },
  });
}

// ── Missing section tasks ─────────────────────────────────────────────────────

/** Tasks of the planning's section that it doesn't contain and hasn't ignored. */
export function useMissingTasks(planningId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.planningMissingTasks(planningId ?? 0),
    queryFn: () => api.plannings.missingTasks(planningId!),
    enabled: planningId != null,
  });
}

/** Imports tasks with the same conversion as section import. Skips tasks already present. */
export function useImportTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planningId, entries }: { planningId: number; entries: PlanningImportEntry[] }) =>
      api.plannings.importTasks(planningId, entries),

    // Imported tasks leave the suggestion list immediately.
    onMutate: async ({ planningId, entries }) => {
      const key = queryKeys.planningMissingTasks(planningId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      const ids = new Set(entries.map(e => e.taskId));
      queryClient.setQueryData<Task[]>(key, prev => prev?.filter(t => !ids.has(t.id)));
      return { previous };
    },
    onError: (_err, { planningId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.planningMissingTasks(planningId), ctx.previous);
    },
    onSuccess: ({ planning }) => {
      queryClient.setQueryData(queryKeys.planning(planning.id), planning);
    },
    onSettled: (_data, _err, { planningId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planning(planningId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.planningMissingTasks(planningId) });
      queryClient.invalidateQueries({ queryKey: LIST_KEY, exact: true }); // item counts
    },
  });
}

export function useIgnoreTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planningId, taskIds }: { planningId: number; taskIds: number[] }) =>
      api.plannings.ignoreTasks(planningId, taskIds),

    onMutate: async ({ planningId, taskIds }) => {
      const key = queryKeys.planningMissingTasks(planningId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Task[]>(key);
      const ids = new Set(taskIds);
      queryClient.setQueryData<Task[]>(key, prev => prev?.filter(t => !ids.has(t.id)));
      return { previous };
    },
    onError: (_err, { planningId }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.planningMissingTasks(planningId), ctx.previous);
    },
    onSettled: (_data, _err, { planningId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planningMissingTasks(planningId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.planning(planningId) }); // ignoredTaskIds
    },
  });
}

/** Un-ignores every task of the planning, so all of them can be suggested again. */
export function useClearIgnoredTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planningId: number) => api.plannings.clearIgnoredTasks(planningId),
    onSettled: (_data, _err, planningId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.planningMissingTasks(planningId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.planning(planningId) });
    },
  });
}

// ── Excel export ──────────────────────────────────────────────────────────────

export type ExportLang = 'fr' | 'en';
const EXPORT_LANG_KEY = 'planning_export_lang';

/** Last language chosen for exports (French by default). */
export function readExportLang(): ExportLang {
  try { return localStorage.getItem(EXPORT_LANG_KEY) === 'en' ? 'en' : 'fr'; } catch { return 'fr'; }
}

/** Fetches the file as a blob (so errors surface) and hands it to the browser as a download. */
export function useExportPlanning() {
  return useMutation({
    mutationFn: async ({ id, options }: { id: number; options: { lang: ExportLang; owner?: string; includeDone: boolean } }) => {
      try { localStorage.setItem(EXPORT_LANG_KEY, options.lang); } catch { /* private mode: not remembered */ }
      const { blob, fileName } = await api.plannings.exportXlsx(id, options);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName ?? 'planning.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give the browser time to start the download before releasing the blob.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  });
}
