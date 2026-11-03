// Group sort modes of a planning. MIRRORED in client/src/utils/planningSort.ts:
// the client and server are built and deployed separately, so the code below
// this header is kept identical in both files (server/tests/planningSort.test.ts
// fails if they drift). Change both together.
// ---- shared code below ----

export type GroupSortMode = 'custom' | 'deadline' | 'priority';
export const GROUP_SORT_MODES: readonly GroupSortMode[] = ['custom', 'deadline', 'priority'];

type SortPriority = 'high' | 'medium' | 'low';
interface SortGroup { id: number; taskId: number | null; order: number; priority?: SortPriority | null }
interface SortItem { groupId: number | null; segments: readonly { end: string }[] }
interface SortTask { id: number; priority: SortPriority }

const PRIORITY_RANK: Record<SortPriority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY = 3;

/** Latest segment end among a group's items (its summary bar end), or null without segments. */
export function groupDeadline(groupId: number, items: readonly SortItem[]): string | null {
  let latest: string | null = null;
  for (const item of items) {
    if (item.groupId !== groupId) continue;
    for (const s of item.segments) if (latest === null || s.end > latest) latest = s.end;
  }
  return latest;
}

/** The linked task's priority when the task exists, else the group's stored value. */
export function effectiveGroupPriority(group: SortGroup, tasksById: ReadonlyMap<number, SortTask>): SortPriority | null {
  const task = group.taskId === null ? undefined : tasksById.get(group.taskId);
  return task ? task.priority : group.priority ?? null;
}

/**
 * Groups in display order for `mode`. Pure: returns a new array and never
 * touches `order` (the user's custom order). Root items are not involved;
 * callers keep them above the groups in the sorted modes.
 * - custom: by order
 * - deadline: earliest deadline first, none last; then priority; then order
 * - priority: high > medium > low > none; then earliest deadline (none last); then order
 */
export function sortGroups<G extends SortGroup>(groups: readonly G[], items: readonly SortItem[], tasks: Iterable<SortTask>, mode: GroupSortMode): G[] {
  const byOrder = (a: G, b: G) => a.order - b.order || a.id - b.id;
  if (mode !== 'deadline' && mode !== 'priority') return [...groups].sort(byOrder);
  const tasksById = new Map<number, SortTask>();
  for (const task of tasks) tasksById.set(task.id, task);
  const deadline = new Map(groups.map(g => [g.id, groupDeadline(g.id, items)]));
  const rank = new Map(groups.map(g => {
    const p = effectiveGroupPriority(g, tasksById);
    return [g.id, p ? PRIORITY_RANK[p] ?? NO_PRIORITY : NO_PRIORITY];
  }));
  const byDeadline = (a: G, b: G) => {
    const x = deadline.get(a.id) ?? null, y = deadline.get(b.id) ?? null;
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  };
  const byPriority = (a: G, b: G) => rank.get(a.id)! - rank.get(b.id)!;
  const [first, second] = mode === 'deadline' ? [byDeadline, byPriority] : [byPriority, byDeadline];
  return [...groups].sort((a, b) => first(a, b) || second(a, b) || byOrder(a, b));
}
