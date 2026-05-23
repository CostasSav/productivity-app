import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FloatingPaths } from './background-paths';

interface WelcomeScreenProps {
  onDismiss: () => void;
}

const TILE = 22;       // tile size in px
const FLASH = 0.07;    // how wide the black-square window is (fraction of total progress)
const APP_NAME = 'My Workspace';

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  // Snapshot viewport at mount so dimensions stay stable mid-animation
  const vpW = useRef(window.innerWidth);
  const vpH = useRef(window.innerHeight);
  const numCols = useRef(Math.ceil(vpW.current / TILE) + 1);
  const numRows = useRef(Math.ceil(vpH.current / TILE) + 1);

  // Pre-compute thresholds synchronously (before first paint)
  // threshold[r][c] ≈ normalised distance from bottom-right corner (0 = BR, 1 = TL)
  const thresholds = useRef<Float32Array[]>([]);
  if (thresholds.current.length === 0) {
    const C = numCols.current;
    const R = numRows.current;
    const maxDist = Math.sqrt((C - 1) ** 2 + (R - 1) ** 2);
    thresholds.current = Array.from({ length: R }, (_, r) => {
      const row = new Float32Array(C);
      for (let c = 0; c < C; c++) {
        const dist = Math.sqrt((c - (C - 1)) ** 2 + (r - (R - 1)) ** 2) / maxDist;
        // Add per-tile noise so the wave looks organic, not perfectly diagonal
        const noise = (Math.random() - 0.5) * 0.18;
        row[c] = Math.min(1, Math.max(0, dist + noise));
      }
      return row;
    });
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const dismissedRef = useRef(false);
  const rafRef = useRef<number>(0);
  const touchStartY = useRef(0);
  const [progress, setProgress] = useState(0);

  // ── Canvas draw ─────────────────────────────────────────────────────────
  const drawCanvas = useCallback((p: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const isDark = document.documentElement.classList.contains('dark');
    const bgColor = isDark ? '#09090b' : '#ffffff';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const th = thresholds.current;
    const R = numRows.current;
    const C = numCols.current;

    for (let r = 0; r < R; r++) {
      const row = th[r];
      for (let c = 0; c < C; c++) {
        const t = row[c];
        const x = c * TILE;
        const y = r * TILE;

        if (p <= t - FLASH) {
          // Tile still intact — fill with welcome background colour
          ctx.fillStyle = bgColor;
          ctx.fillRect(x, y, TILE, TILE);
        } else if (p <= t) {
          // Tile is in the flash band — show as a black square
          ctx.fillStyle = '#000000';
          ctx.fillRect(x, y, TILE, TILE);
        }
        // p > t → tile is dissolved; clearRect already cleared it → app shows through
      }
    }
  }, []);

  // Draw the fully-intact canvas before the browser's first paint to avoid
  // a flash of the app underneath
  useLayoutEffect(() => {
    drawCanvas(0);
  }, [drawCanvas]);

  // ── Progress update ──────────────────────────────────────────────────────
  const updateProgress = useCallback((newP: number) => {
    const clamped = Math.min(1, Math.max(0, newP));
    progressRef.current = clamped;
    setProgress(clamped);

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => drawCanvas(clamped));

    if (clamped >= 1 && !dismissedRef.current) {
      dismissedRef.current = true;
      onDismiss();
    }
  }, [drawCanvas, onDismiss]);

  // ── Scroll / touch capture ───────────────────────────────────────────────
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (dismissedRef.current) return;
      updateProgress(progressRef.current + e.deltaY * 0.003);
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (dismissedRef.current) return;
      e.preventDefault();
      const dy = touchStartY.current - e.touches[0].clientY;
      updateProgress(progressRef.current + dy * 0.005);
      touchStartY.current = e.touches[0].clientY;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateProgress]);

  // Content and paths fade out in the first ~40% of scroll so the pixel
  // dissolve takes over the visual without clashing
  const contentOpacity = Math.max(0, 1 - progress * 2.8);
  const pathsOpacity   = Math.max(0, 1 - progress * 2.2);

  const words = APP_NAME.split(' ');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">

      {/* ── Canvas: pixel dissolve layer ─────────────────────────────── */}
      <canvas
        ref={canvasRef}
        width={vpW.current}
        height={vpH.current}
        className="absolute inset-0 w-full h-full"
      />

      {/* ── FloatingPaths on top of canvas, fades early ───────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: pathsOpacity }}
      >
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* ── Welcome content ───────────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center"
        style={{ opacity: contentOpacity, pointerEvents: contentOpacity < 0.05 ? 'none' : 'auto' }}
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
          className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center shadow-xl shadow-teal-600/20 mb-6"
        >
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </motion.div>

        {/* App name — letter by letter */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-none mb-6">
          {words.map((word, wi) => (
            <span key={wi} className="inline-block mr-4 last:mr-0">
              {word.split('').map((letter, li) => (
                <motion.span
                  key={li}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: 0.3 + wi * 0.15 + li * 0.04,
                    type: 'spring',
                    stiffness: 160,
                    damping: 22,
                  }}
                  className="inline-block text-transparent bg-clip-text bg-gradient-to-br from-gray-900 to-gray-600 dark:from-white dark:to-white/70"
                >
                  {letter}
                </motion.span>
              ))}
            </span>
          ))}
        </h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="text-lg text-gray-500 dark:text-gray-400 max-w-sm mb-6"
        >
          Tasks, notes, habits and focus — all in one place.
        </motion.p>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.6 }}
          onClick={() => {
            if (!dismissedRef.current) {
              dismissedRef.current = true;
              onDismiss();
            }
          }}
          className="px-8 py-3 rounded-full bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-semibold text-base shadow-lg shadow-teal-600/25 transition-colors cursor-pointer mb-6"
        >
          Let&rsquo;s get started
        </motion.button>

        {/* Scroll hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="text-xs text-gray-400 dark:text-gray-600 flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          or scroll to break in
        </motion.p>
      </div>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100 dark:bg-gray-800 z-30">
        <div
          className="h-full bg-teal-500 transition-none"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
