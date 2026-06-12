import { useState, useEffect } from 'react';

const BREAKPOINT = 768;

/**
 * Returns true when the viewport is narrower than 768px (i.e. below Tailwind's `md:` breakpoint).
 * Uses matchMedia so it reacts to resize and device rotation without a scroll listener.
 */
export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINT - 1}px)`);
    // Sync immediately in case state initialised before layout was complete
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
