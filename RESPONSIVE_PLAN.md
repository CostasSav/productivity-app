# Mobile Responsiveness Plan
**Target breakpoints:** 390px (iPhone 14), 480px, 768px (tablet)**
**Audit date:** 2026-06-11

---

## Baseline Check

| Item | Status | Notes |
|------|--------|-------|
| Viewport meta tag | ✅ PASS | `width=device-width, initial-scale=1.0` present in `index.html` |
| Font stack | ✅ PASS | Plus Jakarta Sans loaded — matches design system recommendation |
| Dark mode | ✅ PASS | Tailwind dark: classes throughout |
| prefers-reduced-motion | ❌ MISSING | Animations (fade-in, pulse, etc.) not gated behind this media query |
| touch-action: manipulation | ✅ DONE | `touch-action: manipulation` added globally in `index.css` |
| overscroll-behavior | ✅ DONE | `overscroll-behavior-contain` added to major scroll containers |

---

## Priority 1 — CRITICAL (breaks layout or hides controls on mobile)

### 1. ✅ `client/src/App.tsx` — Sidebar is always visible, no mobile breakpoint
- **DONE:** Sidebar uses `hidden md:flex` with mobile drawer overlay opened by hamburger button. Top bar added for mobile with brand mark and dark mode toggle.

### 2. `client/src/components/calendar/CalendarView.tsx` — 7-column grid unreadable at 390px
- **~Line 355:** `grid grid-cols-7 mb-1` (day headers)
- **~Line 383:** `grid grid-cols-7 gap-1` (calendar cells)
- At 390px ÷ 7 cols = ~55px per cell. Weekday labels, date numbers, task dots, and "+N more" links all become illegible or impossible to tap.
- **PARTIAL:** Calendar is wrapped in an `overflow-x-auto` scroll container so it does not overflow. Full mobile list/week view is a larger effort deferred.

### 3. ✅ `client/src/pages/Grocery.jsx` — Delete and star buttons are hover-only
- **DONE:** Changed to `opacity-60 sm:opacity-0 sm:group-hover:opacity-100` — always visible on mobile, hover-reveal on desktop.

### 4. `client/src/components/PomodoroPanel.tsx` — Fixed panel overlaps content on mobile
- **~Line 82:** `fixed bottom-6 right-6` — the full panel (w-80 = 320px) at 390px viewport leaves only 70px on the left side, covering most of the content area.
- **DEFERRED:** Bottom sheet conversion is a larger effort. Panel is usable at 390px with horizontal scroll.

---

## Priority 2 — HIGH (significantly degraded UX on mobile)

### 5. ✅ `client/src/components/PomodoroTimer.jsx` — Hard-coded w-80 width
- **DONE:** Changed to `w-full max-w-xs sm:w-80 mx-auto`.

### 6. ✅ `client/src/components/calendar/CalendarView.tsx` — Backlog panel w-60
- **DONE:** The entire calendar view is wrapped in `overflow-x-auto`, keeping backlog panel accessible via horizontal scroll on mobile.

### 7. ✅ `client/src/components/calendar/CalendarView.tsx` — Day-detail overlay too wide
- **DONE:** Changed `minWidth` to `min(220px, calc(100vw - 32px))` to prevent overflow off-screen on narrow viewports.

### 8. ✅ `client/src/pages/Habits.jsx` — Edit/drag controls hidden on hover
- **DONE:** Drag handle hidden on mobile (`hidden sm:block`); edit button changed to `p-2.5 active:scale-95` for 44px tap target.

### 9. ✅ `client/src/pages/Bibliotheca.jsx` — Book card drag handle hover-only
- **DONE:** Changed to `hidden sm:block sm:opacity-0 sm:group-hover:opacity-70` — hidden on mobile (drag not supported on touch), visible on desktop hover.

### 10. ✅ `client/src/pages/Today.jsx` — Dashboard layout not audited for mobile stacking
- **DONE:** Hero heading changed to `text-2xl sm:text-4xl`. Focus button `py-1.5` → `py-2.5 min-h-[44px]`. Widget rows already use `flex-wrap` / `gap` — stacking verified at 320px.

---

## Priority 3 — MEDIUM (polish and minor UX gaps)

### 11. ✅ `client/src/components/ui/CommandPalette.tsx` — Palette fills full width at 390px
- **DONE:** Changed to `mx-3 sm:mx-4` for tighter edge breathing room on narrow screens.

### 12. ✅ `client/src/components/ui/Modal.tsx` — Modal cramped on mobile
- **DONE:** Changed to `mx-3 sm:mx-4` giving 12px breathing room on 320px screens.

### 13. `client/src/pages/Sleep.jsx` — Day-chip buttons likely under 44px
- Sleep tracker uses small day chips (`w-6 h-6` style) and quality emoji buttons.
- **DEFERRED:** Audit pending.

### 14. ✅ All pages — Missing `touch-action: manipulation`
- **DONE:** `touch-action: manipulation` added globally in `index.css` on `button, a, [role="button"]`.

### 15. ✅ All scroll containers — Missing `overscroll-behavior-contain`
- **DONE:** `overscroll-behavior: contain` added globally in `index.css`.

---

## Tap Target Audit Summary

| Element | Current Size | Required | File |
|---------|-------------|----------|------|
| Habit drag handle | ✅ hidden sm:block | n/a on mobile | Habits.jsx ~373 |
| Habit edit button | ✅ `p-2.5` ~44px | 44×44px | Habits.jsx ~401 |
| Calendar day cells | ~55×55px (7-col) | 44×44px ✓ barely | CalendarView.tsx |
| Calendar "+N more" | text-only | 44px height | CalendarView.tsx |
| Calendar task dots | ~8px | 44×44px | CalendarView.tsx |
| Grocery delete/star | ✅ always visible | 44px via `p-2.5` | Grocery.jsx |
| Sleep day chips | ~24×24px | 44×44px | Sleep.jsx — DEFERRED |
| Pomodoro reset btn | `p-2` = ~32×32px | 44×44px | PomodoroTimer.jsx — DEFERRED |
| Header icon buttons | `p-1.5` = ~28×28px | 44×44px | PomodoroPanel.tsx — DEFERRED |

---

## Hover-Only Controls (mobile dead zones)

| Control | File | Pattern | Impact |
|---------|------|---------|--------|
| Grocery delete | ✅ FIXED | `opacity-60 sm:opacity-0 sm:group-hover:*` | Always visible mobile |
| Grocery star | ✅ FIXED | `opacity-60 sm:opacity-0 sm:group-hover:*` | Always visible mobile |
| Habit drag handle | ✅ FIXED | `hidden sm:block` | Hidden on mobile (touch DnD N/A) |
| Habit edit button | ✅ FIXED | `p-2.5` | 44px tap target |
| Book drag handle | ✅ FIXED | `hidden sm:block` | Hidden on mobile |
| Task row actions | ✅ FIXED | `opacity-60 sm:opacity-0 sm:group-hover:*` | Always visible mobile |
| Note row actions | ✅ FIXED | `opacity-60 sm:opacity-0 sm:group-hover:*` | Always visible mobile |

---

## Layout Structure at 390px (Current vs. Needed)

```
CURRENT (broken at 390px):
┌──────────┬──────────────────────────────┐
│ Sidebar  │         Main Content         │
│  208px   │           182px              │  ← 390px total
│ (always) │      (almost nothing)        │
└──────────┴──────────────────────────────┘

TARGET (mobile-first):
┌──────────────────────────────────────────┐
│  [☰] My Workspace            [🌙]        │  ← Mobile top bar
├──────────────────────────────────────────┤
│                                          │
│           Full-width content             │
│               390px                      │
│                                          │
└──────────────────────────────────────────┘
  Sidebar = off-canvas drawer, opened by ☰
```

---

## Suggested Implementation Order

1. **App.tsx sidebar** — highest impact, unblocks everything else
2. **Grocery hover-only buttons** — users can't use the app feature at all
3. **Habit hover-only + tap targets** — same functional blocker
4. **Bibliotheca drag handle** — same
5. **PomodoroPanel bottom sheet** — visual blocker
6. **PomodoroTimer w-80** — depends on #5
7. **CalendarView mobile layout** — largest single component effort
8. **Modal/CommandPalette sizing** — polish
9. **touch-action + overscroll-behavior** — global one-liner fixes
10. **Today.jsx widget stacking** — audit required before fixing
