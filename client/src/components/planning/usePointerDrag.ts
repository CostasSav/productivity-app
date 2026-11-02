import { useCallback, useEffect, useRef } from 'react';

export interface DragHandlers {
  /** Called on every pointer move, and again after each auto-scroll step. */
  onMove: (x: number, y: number) => void;
  onEnd: (cancelled: boolean) => void;
}

interface Session extends DragHandlers {
  x: number;
  y: number;
  axis: 'x' | 'y';
  pointerId: number;
}

/** Insets of the scroll container where content is hidden under frozen panels. */
export interface ScrollInsets { left: number; top: number }

const EDGE = 48;      // px from a visible edge where auto-scroll starts
const MAX_SPEED = 18; // px per frame

function edgeSpeed(pos: number, min: number, max: number): number {
  if (pos < min + EDGE) return -Math.min(MAX_SPEED, (min + EDGE - pos) / 2);
  if (pos > max - EDGE) return Math.min(MAX_SPEED, (pos - (max - EDGE)) / 2);
  return 0;
}

/**
 * Pointer-event drags inside a scroll container, without a drag library:
 * window-level listeners (so the pointer can leave the row), Escape to cancel,
 * auto-scroll near the edges, and touch scrolling blocked only while dragging.
 */
export function usePointerDrag(scrollRef: React.RefObject<HTMLDivElement | null>, insets: () => ScrollInsets) {
  const session = useRef<Session | null>(null);
  const frame = useRef(0);
  const cleanup = useRef<() => void>(() => {});
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  const finish = useCallback((cancelled: boolean) => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    cancelAnimationFrame(frame.current);
    cleanup.current();
    current.onEnd(cancelled);
  }, []);

  const start = useCallback((e: { clientX: number; clientY: number; pointerId: number }, axis: 'x' | 'y', handlers: DragHandlers) => {
    finish(true);
    session.current = { ...handlers, x: e.clientX, y: e.clientY, axis, pointerId: e.pointerId };

    const move = (ev: PointerEvent) => {
      const s = session.current;
      if (!s || ev.pointerId !== s.pointerId) return;
      s.x = ev.clientX;
      s.y = ev.clientY;
      s.onMove(s.x, s.y);
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === session.current?.pointerId) finish(false); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === session.current?.pointerId) finish(true); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(true); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };

    const tick = () => {
      const s = session.current;
      const el = scrollRef.current;
      if (!s || !el) return;
      const rect = el.getBoundingClientRect();
      const { left, top } = insetsRef.current();
      const speed = s.axis === 'x' ? edgeSpeed(s.x, rect.left + left, rect.right) : edgeSpeed(s.y, rect.top + top, rect.bottom);
      if (speed) {
        const before = s.axis === 'x' ? el.scrollLeft : el.scrollTop;
        if (s.axis === 'x') el.scrollLeft += speed; else el.scrollTop += speed;
        if ((s.axis === 'x' ? el.scrollLeft : el.scrollTop) !== before) s.onMove(s.x, s.y);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [finish, scrollRef]);

  // Touch: the timeline keeps native panning; once a drag is live, stop the
  // page from scrolling under the finger.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => { if (session.current && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [scrollRef]);

  useEffect(() => () => finish(true), [finish]);

  return { start, cancel: () => finish(true), isDragging: () => session.current !== null };
}
