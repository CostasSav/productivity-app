import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMobile } from '../../hooks/useMobile';
import {
  useUpdatePlanning, useCreatePlanningGroup, useUpdatePlanningGroup, useDeletePlanningGroup,
  useCreatePlanningItem, useUpdatePlanningItem, useDeletePlanningItem, useReorderPlanning,
  useAddPlanningSegment, useUpdatePlanningSegment, useDeletePlanningSegment, useRevertSegment,
} from '../../hooks/usePlannings';
import { DeadlineIssueButton } from './DeadlineIssueButton';
import { Modal } from '../ui/Modal';
import { InlineText } from './InlineText';
import { SegmentMenu } from './SegmentMenu';
import { usePointerDrag } from './usePointerDrag';
import { ALL_OWNERS, UNASSIGNED } from './PlanningToolbar';
import { PriorityBadge } from '../ui/Badge';
import {
  clampCreate, clampMove, clampResize, computeReorder, containerEntries, countdownLabel, formatPlanningDate, freeGap,
  mondayOf, monthSpans, newSegmentId, nextProgressStep, planningItemProgress, planningItemTitle, planningWeeks,
  resolvePlanningLink, weekEnd, weekMonday, weeksBetween, deadlineIssue, deadlineSyncTask, alignedToDeadline,
  groupPriority, nextGroupPriority, rootDisplayEntries, sortedModeDrop,
  type DeadlineIssue, type DropTarget, type EntryKey, type Gap, type PlanningLink, type WeekSpan,
} from '../../utils/planning';
import { localDateStr } from '../../utils/habitStats';
import type { DeadlineSync, PlanningDetail, PlanningGroup, PlanningItem, PlanningItemUpdate, PlanningSegment, Task } from '../../types';

// Layout: one scroll container. Only the Title column is `sticky left-0` (Owner
// and Progress scroll with the timeline, under it), and the
// header `sticky top-0`, so both stay frozen without any JS scroll syncing.
// Week shading, month lines and the current-week outline live in a single
// absolute overlay behind the rows.
//
// Interactions use plain pointer events (see usePointerDrag): drawing, moving
// and resizing bars snap to whole weeks and are clamped so bars of one row
// never overlap; rows are reordered by their grip handle. Mouse wheel and
// trackpad scrolling are untouched; on touch, a bar is drawn after a
// long-press so an ordinary swipe still scrolls.

export const WEEK_W = 44;
const ROW_H = 36;
const GROUP_GAP = 12;
const ADD_ROW_H = ROW_H - 4;
const HEADER_ROW_H = 24;
const BAR_H = ROW_H - 12;            // bars keep this height and stay centered when a row grows
const MIN_TITLE_W = 150;
const MAX_TITLE_W = 600;
const NEST_INDENT = 24;
const LONG_PRESS_MS = 400;
const DESKTOP_COLS = { title: 280, owner: 120, progress: 84 };
const MOBILE_COLS = { title: 128, owner: 64, progress: 48 };

const panelBg = 'bg-white dark:bg-[#09090b]';
const rowBorder = 'border-b border-gray-100 dark:border-zinc-800/60';
const colBorder = 'border-l border-gray-100 dark:border-zinc-800/60';
const iconBtn = 'p-1 rounded flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500';
const revealOnHover = 'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100';
const highlightRow = 'bg-amber-50 dark:bg-[#211c0f]';
const highlightPanel = 'bg-amber-50 dark:bg-[#211c0f]';

export function matchesOwner(item: PlanningItem, filter: string): boolean {
  if (filter === ALL_OWNERS) return true;
  if (filter === UNASSIGNED) return !item.owner;
  return item.owner === filter;
}

type Row =
  | { kind: 'group'; group: PlanningGroup; members: PlanningItem[]; total: number }
  | { kind: 'item'; item: PlanningItem; nested: boolean }
  | { kind: 'add-item'; groupId: number }
  | { kind: 'add-root' };

const rowHeight = (row: Row) => (row.kind === 'group' ? ROW_H + GROUP_GAP : row.kind === 'item' ? ROW_H : ADD_ROW_H);

/** Live state of a bar being drawn, moved or resized. */
interface SegmentDrag {
  mode: 'create' | 'move' | 'start' | 'end';
  itemId: number;
  segmentId: string | null;   // null while drawing a new bar
  color: string;
  preview: WeekSpan;
  origin: WeekSpan;
  moved: boolean;
  x: number;
  y: number;
}

/** Live state of a row being reordered. */
interface RowDrag {
  key: EntryKey;
  target: DropTarget | null;
  lineY: number;
  indent: number;
}

interface PlanningGridProps {
  planning: PlanningDetail;
  tasksById: Map<number, Task>;
  tasksLoading: boolean;
  ownerFilter: string;
  ownersListId: string;
  brushColor: string;
  /** Rows of these tasks flash briefly (e.g. just imported); the first one is scrolled into view. */
  highlightTaskIds?: ReadonlySet<number>;
  /** Called after deleting rows that were linked to tasks (the tasks themselves are untouched). */
  onLinkedRemoved?: (count: number) => void;
  /** A bar change moved a linked task's deadline; `undo` restores the bar and the previous deadline. */
  onDeadlineSynced?: (info: { title: string; to: string; undo: () => void }) => void;
  /** Done toggles for linked rows go through the Tasks page's own update path. */
  onToggleTaskDone: (task: Task, done: boolean) => void;
  onToggleSubtaskDone: (taskId: number, subtaskId: number, done: boolean) => void;
  /** Every name expanded at once (toolbar toggle); a click on a row then shortens just that row. */
  wrapAll?: boolean;
  onEditTask: (task: Task) => void;
}

export function PlanningGrid({
  planning, tasksById, tasksLoading, ownerFilter, ownersListId, brushColor, highlightTaskIds,
  onLinkedRemoved, onDeadlineSynced, onToggleTaskDone, onToggleSubtaskDone, wrapAll = false, onEditTask,
}: PlanningGridProps) {
  const isMobile = useMobile();
  // Title width is per planning (dragged in the header); phones keep the compact layout.
  const [liveTitleW, setLiveTitleW] = useState<number | null>(null);
  const cols = isMobile ? MOBILE_COLS : { ...DESKTOP_COLS, title: liveTitleW ?? planning.titleColumnWidth ?? DESKTOP_COLS.title };
  const leftW = cols.title + cols.owner + cols.progress;
  const timelineW = planning.weekCount * WEEK_W;
  const totalW = leftW + timelineW;
  const headerH = HEADER_ROW_H * (planning.targetDate ? 3 : 2);
  const filtering = ownerFilter !== ALL_OWNERS;

  const updatePlanning = useUpdatePlanning();
  const createGroup = useCreatePlanningGroup();
  const updateGroup = useUpdatePlanningGroup();
  const deleteGroup = useDeletePlanningGroup();
  const createItem = useCreatePlanningItem();
  const updateItem = useUpdatePlanningItem();
  const deleteItem = useDeletePlanningItem();
  const reorder = useReorderPlanning();
  const addSegment = useAddPlanningSegment();
  const updateSegment = useUpdatePlanningSegment();
  const deleteSegment = useDeletePlanningSegment();
  const revertSegment = useRevertSegment();
  const [pendingGroupDelete, setPendingGroupDelete] = useState<{ group: PlanningGroup; count: number } | null>(null);
  const [menu, setMenu] = useState<{ itemId: number; segmentId: string; x: number; y: number } | null>(null);

  // ── Week geometry ──────────────────────────────────────────────────────────
  const weeks = useMemo(() => planningWeeks(planning.startDate, planning.weekCount), [planning.startDate, planning.weekCount]);
  const months = useMemo(() => monthSpans(weeks), [weeks]);
  const col = (monday: string) => weeksBetween(planning.startDate, monday);
  const inRange = (i: number) => i >= 0 && i < planning.weekCount;
  const currentIdx = col(mondayOf(localDateStr()));
  const targetMonday = planning.targetDate ? mondayOf(planning.targetDate) : null;
  const targetIdx = targetMonday ? col(targetMonday) : -1;
  const highlighted = new Set(planning.highlightedWeeks);

  const toggleHighlight = (monday: string) => {
    const next = highlighted.has(monday) ? planning.highlightedWeeks.filter(w => w !== monday) : [...planning.highlightedWeeks, monday].sort();
    updatePlanning.mutate({ id: planning.id, data: { highlightedWeeks: next } });
  };

  const [segDrag, setSegDragState] = useState<SegmentDrag | null>(null);
  const segRef = useRef<SegmentDrag | null>(null);
  const setSegDrag = (next: SegmentDrag | null) => { segRef.current = next; setSegDragState(next); };
  const [rowDrag, setRowDragState] = useState<RowDrag | null>(null);
  const rowRef = useRef<RowDrag | null>(null);
  const setRowDrag = (next: RowDrag | null) => { rowRef.current = next; setRowDragState(next); };

  // ── Group display order (sort mode) ────────────────────────────────────────
  // Sorting only changes what is shown; group `order` (the custom order) is never written.
  // While a bar or row is being dragged the order is frozen, so rows never jump
  // under the pointer; the new order applies once the drag is released.
  const sortMode = planning.groupSortMode ?? 'custom';
  const sorted = sortMode !== 'custom';
  const dragging = segDrag !== null || rowDrag !== null;
  const frozenRoot = useRef<EntryKey[] | null>(null);
  const rootEntries = useMemo(() => {
    const live = rootDisplayEntries(planning, tasksById.values());
    const frozen = frozenRoot.current;
    if (!dragging || !frozen) return live;
    // Keep the frozen positions; anything added meanwhile goes at the end.
    const known = new Set(live.map(e => `${e.kind}${e.id}`));
    const kept = frozen.filter(e => known.has(`${e.kind}${e.id}`));
    const keptKeys = new Set(kept.map(e => `${e.kind}${e.id}`));
    return [...kept, ...live.filter(e => !keptKeys.has(`${e.kind}${e.id}`))];
  }, [planning, tasksById, dragging]);
  if (!dragging) frozenRoot.current = rootEntries;

  // ── Rows: root entries in display order, each group followed by its items ──
  const rows = useMemo(() => {
    const byGroup = new Map<number | null, PlanningItem[]>();
    [...planning.items].sort((a, b) => a.order - b.order).forEach(i => {
      byGroup.set(i.groupId, [...(byGroup.get(i.groupId) ?? []), i]);
    });
    const out: Row[] = [];
    for (const entry of rootEntries) {
      if (entry.kind === 'group') {
        const group = planning.groups.find(g => g.id === entry.id)!;
        const all = byGroup.get(group.id) ?? [];
        const members = all.filter(i => matchesOwner(i, ownerFilter));
        if (filtering && members.length === 0) continue;
        out.push({ kind: 'group', group, members, total: all.length });
        if (!group.collapsed) {
          members.forEach(item => out.push({ kind: 'item', item, nested: true }));
          if (!filtering && group.id > 0) out.push({ kind: 'add-item', groupId: group.id });
        }
      } else {
        const item = planning.items.find(i => i.id === entry.id)!;
        if (matchesOwner(item, ownerFilter)) out.push({ kind: 'item', item, nested: false });
      }
    }
    out.push({ kind: 'add-root' });
    return out;
  }, [planning, rootEntries, ownerFilter, filtering]);

  // ── Brief slide when groups change place (FLIP), so the eye can follow a re-sort ──
  const rowTops = useRef(new Map<string, number>());
  const groupOrderKey = rows.flatMap(r => (r.kind === 'group' ? [r.group.id] : [])).join(',');
  const lastGroupOrder = useRef(groupOrderKey);
  useLayoutEffect(() => {
    const els = bodyRef.current ? [...bodyRef.current.querySelectorAll<HTMLElement>(':scope > [data-row]')] : [];
    const tops = new Map(els.map(el => [el.dataset.row!, el.offsetTop]));
    const moved = lastGroupOrder.current !== groupOrderKey;
    lastGroupOrder.current = groupOrderKey;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (moved && !reduce) {
      for (const el of els) {
        const before = rowTops.current.get(el.dataset.row!);
        const delta = before === undefined ? 0 : before - el.offsetTop;
        if (delta) el.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
      }
    }
    rowTops.current = tops;
  }, [rows]);

  const layout = useMemo(() => {
    let top = 0;
    return rows.map(row => { const box = { top, height: rowHeight(row) }; top += box.height; return box; });
  }, [rows]);

  // ── Expanded (wrapped) names: per row, in component state only ──────────────
  const [toggledRows, setToggledRows] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setToggledRows(new Set()); }, [wrapAll]);
  const isExpanded = (key: string) => wrapAll !== toggledRows.has(key);
  const toggleExpanded = (key: string) => setToggledRows(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Drag callbacks outlive renders, so they read the latest data through a ref.
  const latest = useRef({ planning, rows, layout });
  latest.current = { planning, rows, layout };

  // ── On open, bring the current week into view ──────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<number | null>(null);
  useEffect(() => {
    if (scrolledFor.current === planning.id || !scrollRef.current) return;
    scrolledFor.current = planning.id;
    if (inRange(currentIdx)) scrollRef.current.scrollLeft = Math.max(0, leftW - cols.title + (currentIdx - 2) * WEEK_W);
  }, [planning.id, currentIdx]);

  // ── Highlight (e.g. just-imported rows) and bring the first one into view ──
  const isHighlighted = (row: Row) => {
    if (!highlightTaskIds?.size) return false;
    if (row.kind === 'item') return row.item.taskId !== null && highlightTaskIds.has(row.item.taskId);
    if (row.kind === 'group') {
      // A collapsed group stands in for the new items hidden inside it.
      return (row.group.taskId !== null && highlightTaskIds.has(row.group.taskId))
        || (row.group.collapsed && row.members.some(i => i.taskId !== null && highlightTaskIds.has(i.taskId)));
    }
    return false;
  };
  const highlightKey = highlightTaskIds?.size ? [...highlightTaskIds].sort((a, b) => a - b).join(',') : '';
  const revealedFor = useRef('');
  useEffect(() => {
    const el = scrollRef.current;
    if (!highlightKey || revealedFor.current === highlightKey || !el) return;
    const index = rows.findIndex(isHighlighted);
    if (index < 0) return; // rows not rendered yet; runs again when they are
    revealedFor.current = highlightKey;
    const box = measureLayout()[index];
    const visibleH = el.clientHeight - headerH;
    let top = el.scrollTop;
    if (box.top < el.scrollTop || box.top + box.height > el.scrollTop + visibleH) top = Math.max(0, box.top - visibleH / 3);
    let left = el.scrollLeft;
    const row = rows[index];
    if (row.kind === 'item' && row.item.segments.length) {
      const x = leftW + col(row.item.segments[0].start) * WEEK_W; // content x of the bar
      if (x < el.scrollLeft + cols.title || x + WEEK_W > el.scrollLeft + el.clientWidth) left = Math.max(0, x - cols.title - 2 * WEEK_W);
    }
    el.scrollTo({ top, left, behavior: 'smooth' });
  }, [highlightKey, rows, layout]);

  // Auto-scroll starts where the frozen Title column ends.
  const drag = usePointerDrag(scrollRef, () => ({ left: cols.title, top: headerH }));

  /** Real row boxes (expanded rows are taller); falls back to the nominal layout before render. */
  const measureLayout = () => {
    const els = bodyRef.current ? [...bodyRef.current.querySelectorAll<HTMLElement>(':scope > [data-row]')] : [];
    return els.length === latest.current.rows.length
      ? els.map(el => ({ top: el.offsetTop, height: el.offsetHeight }))
      : latest.current.layout;
  };

  // ── Title column resize ───────────────────────────────────────────────────
  const saveTitleWidth = (width: number) => {
    if (width === planning.titleColumnWidth) { setLiveTitleW(null); return; }
    // Keep the live width until the save settles so the column never jumps back.
    updatePlanning.mutate({ id: planning.id, data: { titleColumnWidth: width } }, { onSettled: () => setLiveTitleW(null) });
  };
  const onResizePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = cols.title;
    let width = startW;
    const move = (ev: PointerEvent) => {
      width = Math.max(MIN_TITLE_W, Math.min(MAX_TITLE_W, Math.round(startW + ev.clientX - startX)));
      setLiveTitleW(width);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      saveTitleWidth(width);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** Week index under a viewport X, clamped to the visible weeks. */
  const weekAt = (clientX: number) => {
    const left = (bodyRef.current?.getBoundingClientRect().left ?? 0) + leftW;
    return Math.max(0, Math.min(latest.current.planning.weekCount - 1, Math.floor((clientX - left) / WEEK_W)));
  };
  const spanOf = (s: PlanningSegment): WeekSpan => ({ start: col(s.start), end: col(s.end) });

  // ── Bars: draw, move, resize ───────────────────────────────────────────────

  /** Tells the page a linked task's deadline moved, with an undo for the bar change and the deadline. */
  const reportSync = (itemId: number, sync: DeadlineSync | null, segmentId: string, previous: PlanningSegment | null) => {
    if (!sync) return;
    const item = latest.current.planning.items.find(i => i.id === itemId);
    onDeadlineSynced?.({
      title: tasksById.get(sync.taskId)?.title ?? item?.title ?? 'task',
      to: sync.to,
      undo: () => revertSegment.mutate({ planningId: planning.id, itemId, segmentId, segment: previous, deadline: sync.from }),
    });
  };
  const ignore = () => {}; // failures are rolled back by the mutation hooks

  const commitSegment = (cancelled: boolean) => {
    const d = segRef.current;
    setSegDrag(null);
    if (cancelled || !d) return;
    const { startDate, items } = latest.current.planning;
    const range = { start: weekMonday(startDate, d.preview.start), end: weekMonday(startDate, d.preview.end) };
    if (d.mode === 'create') {
      const id = newSegmentId();
      addSegment.mutateAsync({ planningId: planning.id, itemId: d.itemId, segment: { id, ...range, color: d.color } })
        .then(res => reportSync(d.itemId, res.deadlineSync, id, null), ignore);
    } else if (!d.moved) {
      // A click without dragging opens the bar's menu (also the touch path).
      setMenu({ itemId: d.itemId, segmentId: d.segmentId!, x: d.x, y: d.y });
    } else if (d.preview.start !== d.origin.start || d.preview.end !== d.origin.end) {
      const previous = items.find(i => i.id === d.itemId)?.segments.find(s => s.id === d.segmentId) ?? null;
      updateSegment.mutateAsync({ planningId: planning.id, itemId: d.itemId, segmentId: d.segmentId!, data: range })
        .then(res => reportSync(d.itemId, res.deadlineSync, d.segmentId!, previous), ignore);
    }
  };

  /** Manual fixes for a deadline outside the bar: local only, they never move the deadline. */
  const alignBar = (item: PlanningItem, issue: DeadlineIssue) => {
    if (issue.kind === 'outside') {
      // Same no-overlap clamp as dragging, should another bar sit in the way.
      const span = spanOf(issue.segment);
      const target = alignedToDeadline(issue.segment, issue.deadline);
      const gap = freeGap(item.segments.filter(s => s.id !== issue.segment.id).map(spanOf), span.start, span.end);
      const placed = clampMove(span, col(target.end) - span.end, gap);
      const { startDate } = planning;
      updateSegment.mutate({ planningId: planning.id, itemId: item.id, segmentId: issue.segment.id,
        data: { start: weekMonday(startDate, placed.start), end: weekMonday(startDate, placed.end) }, syncDeadline: false });
    } else {
      const week = mondayOf(issue.deadline);
      addSegment.mutate({ planningId: planning.id, itemId: item.id, segment: { id: newSegmentId(), start: week, end: week, color: brushColor }, syncDeadline: false });
    }
  };

  const beginCreate = (item: PlanningItem, anchor: number, pointer: { clientX: number; clientY: number; pointerId: number }) => {
    const raw = freeGap(item.segments.map(spanOf), anchor, anchor);
    const gap: Gap = { lo: Math.max(raw.lo, 0), hi: Math.min(raw.hi, planning.weekCount - 1) };
    const first = { start: anchor, end: anchor };
    setSegDrag({ mode: 'create', itemId: item.id, segmentId: null, color: brushColor, preview: first, origin: first, moved: false, x: pointer.clientX, y: pointer.clientY });
    drag.start(pointer, 'x', {
      onMove: (x, y) => {
        const d = segRef.current;
        if (!d) return;
        const at = weekAt(x);
        setSegDrag({ ...d, preview: clampCreate(anchor, at, gap), moved: d.moved || at !== anchor, x, y });
      },
      onEnd: commitSegment,
    });
  };

  const pressTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  const onTimelinePointerDown = (e: React.PointerEvent, item: PlanningItem) => {
    if (item.id < 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const anchor = weekAt(e.clientX);
    if (item.segments.some(s => col(s.start) <= anchor && anchor <= col(s.end))) return;
    if (e.pointerType !== 'touch') {
      e.preventDefault(); // no text selection while drawing
      beginCreate(item, anchor, e);
      return;
    }
    // Touch: a swipe scrolls; holding still for a moment starts drawing.
    const origin = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
    const stop = () => {
      window.clearTimeout(pressTimer.current);
      window.removeEventListener('pointermove', watch);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    const watch = (ev: PointerEvent) => {
      if (ev.pointerId === origin.pointerId && Math.hypot(ev.clientX - origin.clientX, ev.clientY - origin.clientY) > 8) stop();
    };
    window.addEventListener('pointermove', watch);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    pressTimer.current = window.setTimeout(() => { stop(); navigator.vibrate?.(10); beginCreate(item, anchor, origin); }, LONG_PRESS_MS);
  };

  const onSegmentPointerDown = (e: React.PointerEvent, item: PlanningItem, segment: PlanningSegment, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    if (item.id < 0 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const origin = spanOf(segment);
    const gap = freeGap(item.segments.filter(s => s.id !== segment.id).map(spanOf), origin.start, origin.end);
    const grab = weekAt(e.clientX);
    setSegDrag({ mode, itemId: item.id, segmentId: segment.id, color: segment.color, preview: origin, origin, moved: false, x: e.clientX, y: e.clientY });
    drag.start(e, 'x', {
      onMove: (x, y) => {
        const d = segRef.current;
        if (!d) return;
        const at = weekAt(x);
        const preview = mode === 'move' ? clampMove(origin, at - grab, gap) : clampResize(origin, mode, at, gap);
        setSegDrag({ ...d, preview, moved: d.moved || at !== grab, x, y });
      },
      onEnd: commitSegment,
    });
  };

  const onSegmentContextMenu = (e: React.MouseEvent, item: PlanningItem, segment: PlanningSegment) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.id > 0) setMenu({ itemId: item.id, segmentId: segment.id, x: e.clientX, y: e.clientY });
  };

  // ── Rows: drag by the grip to reorder / regroup ────────────────────────────

  /** Drop target for a pointer at body-relative `y`. */
  const dropAt = (y: number, key: EntryKey): Omit<RowDrag, 'key'> => {
    const { planning: p, rows: rs } = latest.current;
    const ls = measureLayout();
    let i = ls.findIndex(l => y < l.top + l.height);
    if (i === -1) i = rs.length - 1;
    const row = rs[i];
    const box = ls[i];
    const lower = y > box.top + box.height / 2;
    const bottom = box.top + box.height;

    if (key.kind === 'group') {
      // Groups only move among root entries: find the root block under the pointer.
      let start = i;
      while (start > 0 && (rs[start].kind === 'add-item' || (rs[start].kind === 'item' && (rs[start] as { nested: boolean }).nested))) start--;
      let end = start;
      while (end + 1 < rs.length && (rs[end + 1].kind === 'add-item' || (rs[end + 1].kind === 'item' && (rs[end + 1] as { nested: boolean }).nested))) end++;
      const head = rs[start];
      if (head.kind === 'add-root') return { target: { groupId: null, before: null }, lineY: ls[start].top, indent: 0 };
      const entry: EntryKey = head.kind === 'group' ? { kind: 'group', id: head.group.id } : { kind: 'item', id: (head as { item: PlanningItem }).item.id };
      const blockTop = ls[start].top;
      const blockBottom = ls[end].top + ls[end].height;
      if (y < (blockTop + blockBottom) / 2) return { target: { groupId: null, before: entry }, lineY: blockTop, indent: 0 };
      const roots = containerEntries(p, null);
      const next = roots[roots.findIndex(r => r.kind === entry.kind && r.id === entry.id) + 1] ?? null;
      return { target: { groupId: null, before: next }, lineY: blockBottom, indent: 0 };
    }

    switch (row.kind) {
      case 'item': {
        const list = containerEntries(p, row.item.groupId);
        const at = list.findIndex(e => e.kind === 'item' && e.id === row.item.id);
        const indent = row.item.groupId === null ? 0 : NEST_INDENT;
        return lower
          ? { target: { groupId: row.item.groupId, before: list[at + 1] ?? null }, lineY: bottom, indent }
          : { target: { groupId: row.item.groupId, before: { kind: 'item', id: row.item.id } }, lineY: box.top, indent };
      }
      case 'group': {
        if (!lower) return { target: { groupId: null, before: { kind: 'group', id: row.group.id } }, lineY: box.top, indent: 0 };
        const first = row.group.collapsed ? null : containerEntries(p, row.group.id)[0] ?? null;
        return { target: { groupId: row.group.id, before: first }, lineY: bottom, indent: NEST_INDENT };
      }
      case 'add-item':
        return { target: { groupId: row.groupId, before: null }, lineY: box.top, indent: NEST_INDENT };
      default:
        return { target: { groupId: null, before: null }, lineY: box.top, indent: 0 };
    }
  };

  const onGripPointerDown = (e: React.PointerEvent, key: EntryKey) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setRowDrag({ key, target: null, lineY: 0, indent: 0 });
    drag.start(e, 'y', {
      onMove: (_x, y) => {
        const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
        setRowDrag({ key, ...dropAt(y - top, key) });
      },
      onEnd: cancelled => {
        const d = rowRef.current;
        setRowDrag(null);
        if (cancelled || !d?.target) return;
        const p = latest.current.planning;
        const payload = computeReorder(p, d.key, sortedModeDrop(p, d.key, d.target));
        if (payload) reorder.mutate({ planningId: planning.id, ...payload });
      },
    });
  };

  const isDraggedRow = (row: Row) => {
    if (!rowDrag) return false;
    const { kind, id } = rowDrag.key;
    if (row.kind === 'group') return kind === 'group' && row.group.id === id;
    if (row.kind === 'item') return (kind === 'item' && row.item.id === id) || (kind === 'group' && row.item.groupId === id);
    return false;
  };

  // ── Rendering helpers ──────────────────────────────────────────────────────
  const segmentBox = (span: WeekSpan) => ({ left: span.start * WEEK_W, width: (span.end - span.start + 1) * WEEK_W });

  const removeGroup = (group: PlanningGroup, count: number) => {
    if (count > 0) { setPendingGroupDelete({ group, count }); return; }
    deleteGroup.mutate({ planningId: planning.id, id: group.id, mode: 'deleteItems' });
    if (group.taskId !== null) onLinkedRemoved?.(1);
  };
  const confirmGroupDelete = (mode: 'moveToRoot' | 'deleteItems') => {
    if (!pendingGroupDelete) return;
    const { group } = pendingGroupDelete;
    const removedLinks = (group.taskId !== null ? 1 : 0)
      + (mode === 'deleteItems' ? planning.items.filter(i => i.groupId === group.id && i.taskId !== null).length : 0);
    deleteGroup.mutate({ planningId: planning.id, id: group.id, mode });
    setPendingGroupDelete(null);
    if (removedLinks > 0) onLinkedRemoved?.(removedLinks);
  };

  const menuItem = menu ? planning.items.find(i => i.id === menu.itemId) : undefined;
  const menuSegment = menuItem?.segments.find(s => s.id === menu?.segmentId);
  const reorderHint = filtering ? 'Clear the owner filter to reorder' : 'Drag to reorder';

  return (
    <div ref={scrollRef} className={`flex-1 min-h-0 overflow-auto ${segDrag || rowDrag ? 'select-none' : ''}`}>
      <div className="flex flex-col min-h-full" style={{ width: totalW }}>

        {/* ── Header ── */}
        <div className={`sticky top-0 z-20 flex flex-shrink-0 ${panelBg} border-b border-gray-200 dark:border-zinc-700`} style={{ height: headerH }}>
          {/* Header cells sit directly in the header row: a sticky cell can't leave its parent box. */}
          {(['Title', 'Owner', isMobile ? '%' : 'Progress'] as const).map((label, i) => (
              <div key={label} style={{ width: [cols.title, cols.owner, cols.progress][i] }}
                className={`relative self-stretch flex items-end px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400 ${panelBg}
                  ${i === 0 ? 'sticky left-0 z-30 border-r border-gray-200 dark:border-zinc-700' : i === 2 ? 'border-r border-gray-200 dark:border-zinc-700' : ''}`}>
                <span className="truncate">{label}</span>
                {i === 0 && !isMobile && (
                  <div role="separator" aria-orientation="vertical" aria-label="Resize the Title column" tabIndex={0}
                    aria-valuemin={MIN_TITLE_W} aria-valuemax={MAX_TITLE_W} aria-valuenow={cols.title}
                    title="Drag to resize (double-click to reset)"
                    onPointerDown={onResizePointerDown}
                    onDoubleClick={() => saveTitleWidth(DESKTOP_COLS.title)}
                    onKeyDown={e => {
                      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                      e.preventDefault();
                      const width = Math.max(MIN_TITLE_W, Math.min(MAX_TITLE_W, cols.title + (e.key === 'ArrowRight' ? 20 : -20)));
                      setLiveTitleW(width);
                      saveTitleWidth(width);
                    }}
                    className="group/resize absolute -right-1.5 top-0 bottom-0 w-3 z-10 cursor-col-resize touch-none flex justify-center focus-visible:outline-none">
                    <span className={`w-0.5 h-full ${liveTitleW !== null ? 'bg-teal-500' : 'group-hover/resize:bg-teal-400 group-focus-visible/resize:bg-teal-500'}`} />
                  </div>
                )}
              </div>
            ))}

          <div className="relative" style={{ width: timelineW }}>
            {months.map(m => (
              <div key={m.key} style={{ left: m.start * WEEK_W, width: m.span * WEEK_W, height: HEADER_ROW_H }}
                className={`absolute top-0 flex items-center px-1.5 text-xs font-semibold text-gray-700 dark:text-zinc-200 truncate ${m.start ? 'border-l border-gray-300 dark:border-zinc-600' : ''}`}>
                {m.label}
              </div>
            ))}
            {weeks.map(w => {
              const isCurrent = w.index === currentIdx;
              const isTarget = w.index === targetIdx;
              const isHighlighted = highlighted.has(w.monday);
              return (
                <button key={w.monday} type="button" onClick={() => toggleHighlight(w.monday)} aria-pressed={isHighlighted}
                  title={`Week of ${formatPlanningDate(w.monday)}. Click to ${isHighlighted ? 'remove the highlight' : 'highlight this week'}`}
                  style={{ left: w.index * WEEK_W, width: WEEK_W, top: HEADER_ROW_H, height: HEADER_ROW_H }}
                  className={`absolute flex items-center justify-center text-[11px] tabular-nums cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.06]
                    ${w.monthStart ? 'border-l border-gray-300 dark:border-zinc-600' : ''}
                    ${isTarget ? 'bg-teal-100 dark:bg-teal-400/15' : isHighlighted ? 'bg-amber-100 dark:bg-amber-400/15' : ''}
                    ${isCurrent ? 'font-bold text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-zinc-400'}`}>
                  {w.label}
                </button>
              );
            })}
            {targetMonday && weeks.map(w => (
              <div key={w.monday} style={{ left: w.index * WEEK_W, width: WEEK_W, top: HEADER_ROW_H * 2, height: HEADER_ROW_H }}
                className={`absolute flex items-center justify-center text-[11px] tabular-nums
                  ${w.monthStart ? 'border-l border-gray-300 dark:border-zinc-600' : ''}
                  ${w.index === targetIdx ? 'font-bold text-teal-700 bg-teal-100 dark:text-teal-300 dark:bg-teal-400/15' : 'text-gray-400 dark:text-zinc-500'}`}>
                {countdownLabel(w.monday, targetMonday)}
              </div>
            ))}
            {inRange(currentIdx) && (
              <div aria-hidden className="absolute border-2 border-b-0 border-red-500 pointer-events-none"
                style={{ left: currentIdx * WEEK_W, width: WEEK_W, top: HEADER_ROW_H, bottom: 0 }} />
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div ref={bodyRef} className="relative flex-1">
          <div aria-hidden className="absolute top-0 bottom-0 pointer-events-none"
            style={{ left: leftW, width: timelineW, backgroundImage: 'linear-gradient(to right, rgba(148,163,184,0.16) 1px, transparent 1px)', backgroundSize: `${WEEK_W}px 100%` }}>
            {weeks.map(w => {
              const shade = w.index === targetIdx ? 'bg-teal-100/70 dark:bg-teal-400/10' : highlighted.has(w.monday) ? 'bg-amber-100/60 dark:bg-amber-400/10' : null;
              return shade && <div key={w.monday} className={`absolute top-0 bottom-0 ${shade}`} style={{ left: w.index * WEEK_W, width: WEEK_W }} />;
            })}
            {weeks.filter(w => w.monthStart).map(w => (
              <div key={w.monday} className="absolute top-0 bottom-0 w-px bg-gray-300 dark:bg-zinc-600" style={{ left: w.index * WEEK_W }} />
            ))}
          </div>

          {rows.map(row => {
            const dragged = isDraggedRow(row);
            if (row.kind === 'group') {
              const g = row.group;
              const pending = g.id < 0;
              const spans = row.members.flatMap(i => i.segments.map(spanOf));
              const summary = spans.length
                ? segmentBox({ start: Math.min(...spans.map(s => s.start)), end: Math.max(...spans.map(s => s.end)) })
                : null;
              const lit = isHighlighted(row);
              const groupTask = g.taskId !== null ? tasksById.get(g.taskId) ?? null : null;
              const priority = groupPriority(g, tasksById);
              return (
                <div key={`g${g.id}`} data-row={`g${g.id}`} className={`group flex ${rowBorder} transition-colors duration-700 ${lit ? highlightRow : ''} ${pending || dragged ? 'opacity-40' : ''}`} style={{ minHeight: ROW_H + GROUP_GAP }}>
                  <div className={`sticky left-0 z-10 flex items-center gap-0.5 px-0.5 transition-colors duration-700 ${lit ? highlightPanel : panelBg} border-r border-gray-200 dark:border-zinc-700`}
                    style={{ width: cols.title, paddingTop: GROUP_GAP + 2, paddingBottom: 2 }}>
                    <Grip disabled={pending || filtering || sorted} locked={sorted && !pending && !filtering} label={`Reorder group ${g.name}`}
                      hint={sorted ? 'Switch to Custom order to reorder groups manually' : reorderHint}
                      onPointerDown={e => onGripPointerDown(e, { kind: 'group', id: g.id })} />
                    <button type="button" disabled={pending} aria-expanded={!g.collapsed}
                      aria-label={`${g.collapsed ? 'Expand' : 'Collapse'} group ${g.name}`}
                      onClick={() => updateGroup.mutate({ planningId: planning.id, id: g.id, data: { collapsed: !g.collapsed } })}
                      className={`${iconBtn} text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200`}>
                      <svg className={`w-3.5 h-3.5 transition-transform ${g.collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {groupTask && (
                      <DoneBox checked={groupTask.status === 'done'} disabled={pending} label={`Mark task ${groupTask.title} done`}
                        onChange={done => onToggleTaskDone(groupTask, done)} />
                    )}
                    {/* A group made from a task shows (and renames) the live task title. */}
                    <span className={`min-w-0 flex ${groupTask?.status === 'done' ? 'opacity-60' : ''}`}>
                      <InlineText value={groupTask?.title ?? g.name} required disabled={pending} ariaLabel="Group name"
                        mode="name" expanded={isExpanded(`g${g.id}`)} onToggleExpand={() => toggleExpanded(`g${g.id}`)}
                        onCommit={name => updateGroup.mutate({ planningId: planning.id, id: g.id, data: { name } })}
                        className="text-xs font-bold uppercase tracking-wide text-gray-800 dark:text-zinc-100" inputClassName="text-xs font-bold uppercase" />
                    </span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 flex-shrink-0 tabular-nums">{row.total}</span>
                    {/* Same badge as task cards; a linked group sets its task's priority. */}
                    <button type="button" disabled={pending}
                      onClick={() => updateGroup.mutate({ planningId: planning.id, id: g.id, data: { priority: nextGroupPriority(priority, groupTask !== null) } })}
                      title="Click to change priority" aria-label={`Priority of ${g.name}: ${priority ?? 'none'}. Click to change`}
                      className={`flex-shrink-0 ml-1 rounded-full hover:opacity-75 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${priority ? '' : revealOnHover}`}>
                      {priority ? <PriorityBadge priority={priority} /> : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-dashed border-gray-300 text-gray-400 dark:border-zinc-600 dark:text-zinc-500">
                          No priority
                        </span>
                      )}
                    </button>
                    {!pending && (
                      <button type="button" onClick={() => removeGroup(g, row.total)} aria-label={`Delete group ${g.name}`} title="Delete group"
                        className={`${iconBtn} ml-auto text-gray-400 hover:text-red-600 dark:hover:text-red-400 ${revealOnHover}`}>
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  <div aria-hidden className="border-r border-gray-200 dark:border-zinc-700" style={{ width: cols.owner + cols.progress }} />
                  {/* Clipped like item rows, so bars past the last week never widen the scroll area. */}
                  <div className="relative overflow-hidden" style={{ width: timelineW, paddingTop: GROUP_GAP }}>
                    {summary && (
                      <div aria-hidden className="absolute h-1.5 rounded-full bg-gray-400/80 dark:bg-zinc-500"
                        style={{ left: summary.left + 2, width: summary.width - 4, top: `calc(50% + ${GROUP_GAP / 2 - 3}px)` }} />
                    )}
                  </div>
                </div>
              );
            }

            if (row.kind === 'item') {
              const item = row.item;
              const link = resolvePlanningLink(item, tasksById);
              const issue = deadlineIssue(item, deadlineSyncTask(item, tasksById));
              // Done: the linked task or subtask, or 100% for a standalone item. A subtask row also
              // counts as done (100%, as before) when its parent task is done; its box is then locked.
              const parentDone = !!link?.subtask && link.task.status === 'done';
              const done = link ? parentDone || (link.subtask ?? link.task).status === 'done' : item.progress === 100;
              const toggleDone = (next: boolean) => {
                if (link?.subtask) onToggleSubtaskDone(link.task.id, link.subtask.id, next);
                else if (link) onToggleTaskDone(link.task, next);
                else updateItem.mutate({ planningId: planning.id, id: item.id, data: next
                  ? { progress: 100, progressBeforeDone: item.progress }
                  : { progress: item.progressBeforeDone ?? 0, progressBeforeDone: null } });
              };
              return (
                <ItemRow key={`i${item.id}`} item={item} nested={row.nested} link={link} dragged={dragged} highlighted={isHighlighted(row)}
                  expanded={isExpanded(`i${item.id}`)} onToggleExpand={() => toggleExpanded(`i${item.id}`)}
                  linked={item.taskId != null && (link != null || tasksLoading)}
                  title={link ? planningItemTitle(item, tasksById) : item.title}
                  progress={planningItemProgress(item, tasksById)}
                  done={done} doneDisabled={parentDone || (item.taskId !== null && !link && tasksLoading)} onToggleDone={toggleDone}
                  doneHint={parentDone ? 'Done because the parent task is done' : undefined}
                  issue={issue} onFixIssue={() => issue && alignBar(item, issue)}
                  cols={cols} leftW={leftW} timelineW={timelineW} ownersListId={ownersListId}
                  spanOf={spanOf} segmentBox={segmentBox}
                  drag={segDrag?.itemId === item.id ? segDrag : null}
                  reorderDisabled={filtering} reorderHint={reorderHint}
                  onGripPointerDown={e => onGripPointerDown(e, { kind: 'item', id: item.id })}
                  onTimelinePointerDown={e => onTimelinePointerDown(e, item)}
                  onSegmentPointerDown={(e, s, mode) => onSegmentPointerDown(e, item, s, mode)}
                  onSegmentContextMenu={(e, s) => onSegmentContextMenu(e, item, s)}
                  onEditTask={onEditTask}
                  onUpdate={data => updateItem.mutate({ planningId: planning.id, id: item.id, data })}
                  onDelete={() => {
                    deleteItem.mutate({ planningId: planning.id, id: item.id });
                    if (item.taskId !== null) onLinkedRemoved?.(1);
                  }} />
              );
            }

            const addItem = (groupId: number | null) => (title: string) =>
              createItem.mutate({ planningId: planning.id, data: { title, groupId } });
            return (
              <div key={row.kind === 'add-item' ? `a${row.groupId}` : 'add-root'} data-row="add" className="flex" style={{ height: ADD_ROW_H }}>
                <div className={`sticky left-0 z-10 flex items-center gap-1 ${panelBg} border-r border-gray-200 dark:border-zinc-700`}
                  style={{ width: cols.title, paddingLeft: row.kind === 'add-item' ? NEST_INDENT + 16 : 4 }}>
                  {row.kind === 'add-item' ? (
                    <AddInline label="+ Item" placeholder="New item title" onAdd={addItem(row.groupId)} />
                  ) : (
                    <>
                      <AddInline label="+ Item" placeholder="New item title" onAdd={addItem(null)} />
                      <AddInline label="+ Group" placeholder="New group name" onAdd={name => createGroup.mutate({ planningId: planning.id, name })} />
                    </>
                  )}
                </div>
                <div aria-hidden className="border-r border-gray-200 dark:border-zinc-700" style={{ width: cols.owner + cols.progress }} />
              </div>
            );
          })}

          {inRange(currentIdx) && (
            <div aria-hidden className="absolute top-0 bottom-0 z-[5] border-2 border-t-0 border-red-500 pointer-events-none"
              style={{ left: leftW + currentIdx * WEEK_W, width: WEEK_W }} />
          )}

          {rowDrag?.target && (
            <div aria-hidden className="absolute z-30 h-0.5 bg-teal-500 pointer-events-none"
              style={{ top: rowDrag.lineY - 1, left: rowDrag.indent, width: totalW - rowDrag.indent }}>
              <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-teal-500" />
            </div>
          )}
        </div>
      </div>

      {segDrag && segDrag.moved && createPortal(
        <div role="status" className="fixed z-50 pointer-events-none px-2 py-1 rounded bg-gray-900/90 text-white text-xs shadow-lg whitespace-nowrap"
          style={{ left: segDrag.x + 14, top: segDrag.y - 34 }}>
          {formatPlanningDate(weekMonday(planning.startDate, segDrag.preview.start))} – {formatPlanningDate(weekEnd(weekMonday(planning.startDate, segDrag.preview.end)))}
          <span className="text-gray-400"> · {segDrag.preview.end - segDrag.preview.start + 1} wk{segDrag.preview.end === segDrag.preview.start ? '' : 's'}</span>
        </div>,
        document.body,
      )}

      {menu && menuItem && menuSegment && (
        <SegmentMenu segment={menuSegment} legend={planning.legend} x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          onColor={color => updateSegment.mutate({ planningId: planning.id, itemId: menuItem.id, segmentId: menuSegment.id, data: { color } })}
          onDelete={() => {
            const previous = menuSegment;
            deleteSegment.mutateAsync({ planningId: planning.id, itemId: menuItem.id, segmentId: previous.id })
              .then(res => reportSync(menuItem.id, res.deadlineSync, previous.id, previous), ignore);
          }} />
      )}

      {pendingGroupDelete && (
        <Modal
          title={`Delete group "${pendingGroupDelete.group.name}"?`}
          onClose={() => setPendingGroupDelete(null)}
          footer={
            <>
              <button onClick={() => setPendingGroupDelete(null)} className="px-4 py-2 min-h-[44px] rounded text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
              <button
                onClick={() => confirmGroupDelete('moveToRoot')}
                className="px-4 py-2 min-h-[44px] rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                Move items to root
              </button>
              <button
                onClick={() => confirmGroupDelete('deleteItems')}
                className="px-4 py-2 min-h-[44px] rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer">
                Delete items too
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This group contains {pendingGroupDelete.count} item{pendingGroupDelete.count === 1 ? '' : 's'}. You can delete them with the group,
            or keep them at the root of the planning. Linked tasks are never affected.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: PlanningItem;
  nested: boolean;
  link: PlanningLink | null;
  linked: boolean;           // linked to a live task (or tasks are still loading)
  title: string;
  progress: number;
  done: boolean;
  doneDisabled: boolean;
  doneHint?: string;
  onToggleDone: (done: boolean) => void;
  issue: DeadlineIssue | null;
  onFixIssue: () => void;
  dragged: boolean;
  highlighted: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  cols: typeof DESKTOP_COLS;
  leftW: number;
  timelineW: number;
  ownersListId: string;
  spanOf: (s: PlanningSegment) => WeekSpan;
  segmentBox: (span: WeekSpan) => { left: number; width: number };
  drag: SegmentDrag | null;  // only when this row's bar is being edited
  reorderDisabled: boolean;
  reorderHint: string;
  onGripPointerDown: (e: React.PointerEvent) => void;
  onTimelinePointerDown: (e: React.PointerEvent) => void;
  onSegmentPointerDown: (e: React.PointerEvent, segment: PlanningSegment, mode: 'move' | 'start' | 'end') => void;
  onSegmentContextMenu: (e: React.MouseEvent, segment: PlanningSegment) => void;
  onEditTask: (task: Task) => void;
  onUpdate: (data: PlanningItemUpdate) => void;
  onDelete: () => void;
}

function ItemRow({
  item, nested, link, linked, title, progress, done, doneDisabled, doneHint, onToggleDone, issue, onFixIssue, dragged, highlighted, expanded, onToggleExpand, cols, leftW, timelineW, ownersListId, spanOf, segmentBox, drag,
  reorderDisabled, reorderHint, onGripPointerDown, onTimelinePointerDown, onSegmentPointerDown, onSegmentContextMenu, onEditTask, onUpdate, onDelete,
}: ItemRowProps) {
  const pending = item.id < 0;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const dimmed = done || (linked && progress === 100);
  const progressHelp = link?.subtask
    ? 'Follows the linked subtask: 100% when it is done, otherwise 0%. Edit the task to change it.'
    : 'Computed from the linked task: 100% when done, otherwise the share of completed subtasks. Edit the task to change it.';

  return (
    <div data-row={`i${item.id}`} className={`group flex ${rowBorder} transition-colors duration-700 ${highlighted ? highlightRow : ''} ${pending || dragged ? 'opacity-40' : ''}`} style={{ minHeight: ROW_H }}>
      <div className={`sticky left-0 z-10 flex items-stretch transition-colors duration-700 ${highlighted ? highlightPanel : `${panelBg} group-hover:bg-gray-50 dark:group-hover:bg-[#131316]`} border-r border-gray-200 dark:border-zinc-700`} style={{ width: cols.title }}>
        <div className={`flex items-center gap-0.5 min-w-0 pr-1 ${expanded ? 'py-1' : ''}`} style={{ width: cols.title, paddingLeft: nested ? NEST_INDENT - 14 : 2 }}>
          <Grip disabled={pending || reorderDisabled} label={`Reorder ${title}`} hint={reorderHint} onPointerDown={onGripPointerDown} />
          <DoneBox checked={done} disabled={pending || doneDisabled} label={`Mark ${title} done`} hint={doneHint} onChange={onToggleDone} />
          <div className={`flex items-center gap-1 min-w-0 flex-1 ${dimmed ? 'opacity-60' : ''}`}>
            {linked ? (
              <>
                <button type="button" disabled={!link} onClick={() => link && onEditTask(link.task)}
                  aria-label={`Edit linked task ${title}`} title="Linked to a task. Click to edit the task"
                  className={`${iconBtn} text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </button>
                {/* Renaming a linked row renames the real task (or subtask) too. */}
                <InlineText value={title} required disabled={pending || !link} ariaLabel="Task title" onCommit={t => onUpdate({ title: t })}
                  mode="name" expanded={expanded} onToggleExpand={onToggleExpand}
                  className="text-sm text-gray-800 dark:text-zinc-100" inputClassName="text-sm" />
              </>
            ) : (
              <InlineText value={item.title} required disabled={pending} ariaLabel="Item title" onCommit={t => onUpdate({ title: t })}
                mode="name" expanded={expanded} onToggleExpand={onToggleExpand}
                className="text-sm text-gray-800 dark:text-zinc-100" inputClassName="text-sm" />
            )}
          </div>
          {issue && !pending && <DeadlineIssueButton issue={issue} onFix={onFixIssue} />}
          {!pending && (
            <button type="button"
              onClick={() => (confirming ? onDelete() : setConfirming(true))}
              aria-label={confirming ? `Confirm delete ${title}` : `Delete ${title}`}
              title={confirming ? 'Click again to delete' : 'Delete item'}
              className={`${iconBtn} ml-auto ${confirming ? 'text-white bg-red-600 hover:bg-red-700' : `text-gray-400 hover:text-red-600 dark:hover:text-red-400 ${revealOnHover}`}`}>
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
      {/* Owner and Progress scroll with the timeline. */}
      <div className={`flex items-stretch transition-colors duration-700 ${highlighted ? '' : 'group-hover:bg-gray-50 dark:group-hover:bg-[#131316]'} border-r border-gray-200 dark:border-zinc-700`} style={{ width: leftW - cols.title }}>
        <div className="flex items-center px-0.5 min-w-0" style={{ width: cols.owner }}>
          <InlineText value={item.owner ?? ''} placeholder="—" disabled={pending} listId={ownersListId} maxLength={100}
            ariaLabel="Owner" onCommit={owner => onUpdate({ owner: owner || null })}
            className="text-xs text-gray-600 dark:text-zinc-300 w-full" inputClassName="text-xs" />
        </div>
        <div className={`flex items-center justify-center ${colBorder}`} style={{ width: cols.progress }}>
          {linked ? (
            <span className="cursor-help px-1" title={progressHelp} aria-label={`Progress ${progress}%. ${progressHelp}`}>
              <ProgressValue value={progress} muted />
            </span>
          ) : (
            <button type="button" disabled={pending} onClick={() => onUpdate({ progress: nextProgressStep(item.progress) })}
              title="Click to cycle 0 → 25 → 50 → 75 → 100%" aria-label={`Progress ${progress}%. Click to change`}
              className="px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] cursor-pointer">
              <ProgressValue value={progress} />
            </button>
          )}
        </div>
      </div>

      <div onPointerDown={onTimelinePointerDown}
        className={`relative overflow-hidden ${pending ? '' : 'cursor-crosshair'} ${dimmed && !drag ? 'opacity-60' : ''}`} style={{ width: timelineW }}>
        {item.segments.map(s => {
          const editing = drag?.segmentId === s.id;
          const box = segmentBox(editing ? drag.preview : spanOf(s));
          return (
            <div key={s.id}
              onPointerDown={e => onSegmentPointerDown(e, s, 'move')}
              onContextMenu={e => onSegmentContextMenu(e, s)}
              title={drag ? undefined : `${title}: ${formatPlanningDate(s.start)} – ${formatPlanningDate(weekEnd(s.end))}. Drag to move, drag an edge to resize, click for options`}
              className={`group/seg absolute rounded-sm shadow-sm touch-none
                ${pending ? '' : editing && drag.mode === 'move' ? 'cursor-grabbing' : 'cursor-grab'}
                ${editing ? 'z-10 ring-2 ring-gray-900/40 dark:ring-white/60' : ''}`}
              style={{ left: box.left + 2, width: box.width - 4, top: '50%', height: BAR_H, marginTop: -BAR_H / 2, backgroundColor: s.color }}>
              {!pending && (['start', 'end'] as const).map(edge => (
                <div key={edge} onPointerDown={e => onSegmentPointerDown(e, s, edge)}
                  className={`absolute top-0 bottom-0 w-2 cursor-ew-resize rounded-sm group-hover/seg:bg-black/15 ${edge === 'start' ? 'left-0' : 'right-0'}`} />
              ))}
            </div>
          );
        })}
        {drag?.mode === 'create' && (() => {
          const box = segmentBox(drag.preview);
          return (
            <div aria-hidden className="absolute rounded-sm opacity-70 ring-2 ring-gray-900/30 dark:ring-white/50 pointer-events-none"
              style={{ left: box.left + 2, width: box.width - 4, top: '50%', height: BAR_H, marginTop: -BAR_H / 2, backgroundColor: drag.color }} />
          );
        })()}
      </div>
    </div>
  );
}

function DoneBox({ checked, disabled, label, hint, onChange }: { checked: boolean; disabled: boolean; label: string; hint?: string; onChange: (done: boolean) => void }) {
  return (
    <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} title={hint ?? (checked ? 'Mark as not done' : 'Mark as done')}
      onChange={e => onChange(e.target.checked)}
      className="w-3.5 h-3.5 mx-0.5 flex-shrink-0 accent-teal-600 cursor-pointer disabled:cursor-not-allowed" />
  );
}

/** `locked`: disabled but still visible on hover, so its tooltip can explain why. */
function Grip({ disabled, locked = false, label, hint, onPointerDown }: { disabled: boolean; locked?: boolean; label: string; hint: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span role="button" aria-label={label} aria-disabled={disabled} title={hint}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={`flex-shrink-0 w-3.5 h-6 flex items-center justify-center rounded touch-none text-gray-300 dark:text-zinc-600
        ${locked ? 'cursor-not-allowed opacity-40 md:opacity-0 md:group-hover:opacity-40' : disabled ? 'opacity-0' : `cursor-grab active:cursor-grabbing hover:text-gray-500 dark:hover:text-zinc-400 ${revealOnHover}`}`}>
      <svg className="w-2.5 h-3.5" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
        {[2, 8].flatMap(cx => [3, 8, 13].map(cy => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.4} />))}
      </svg>
    </span>
  );
}

function ProgressValue({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="hidden sm:block w-7 h-1.5 rounded-full bg-gray-200 dark:bg-zinc-700 overflow-hidden">
        <span className={`block h-full ${value === 100 ? 'bg-green-500' : muted ? 'bg-teal-400/80' : 'bg-teal-500'}`} style={{ width: `${value}%` }} />
      </span>
      <span className={`text-xs tabular-nums ${muted ? 'text-gray-500 dark:text-zinc-400' : 'text-gray-700 dark:text-zinc-200'}`}>{value}%</span>
    </span>
  );
}

// ── Add row ───────────────────────────────────────────────────────────────────

/** Button that turns into an input; Enter adds and stays open for the next entry. */
function AddInline({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (text: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const submit = () => { const v = text.trim(); if (v) onAdd(v); setText(''); };

  if (adding) {
    return (
      <input autoFocus value={text} maxLength={200} placeholder={placeholder} aria-label={placeholder}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setText(''); setAdding(false); }
        }}
        onBlur={() => { submit(); setAdding(false); }}
        className="flex-1 min-w-0 mr-2 border rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
    );
  }
  return (
    <button type="button" onClick={() => setAdding(true)}
      className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:text-zinc-500 dark:hover:text-teal-400 dark:hover:bg-white/[0.06] cursor-pointer">
      {label}
    </button>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
