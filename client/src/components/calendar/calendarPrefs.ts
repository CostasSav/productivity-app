// Per-device calendar preferences. Storage can be unavailable (private mode, blocked site data):
// every access is guarded and falls back to defaults.

export type CalendarMode = 'month' | 'week' | 'day';
const MODE_KEY = 'calendar_view_mode';
const HIDDEN_KEY = 'calendar_hidden_feeds';

export function loadMode(): CalendarMode {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'week' || value === 'day' ? value : 'month';
  } catch { return 'month'; }
}

export function saveMode(mode: CalendarMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* preference only */ }
}

export function loadHiddenFeeds(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}

export function saveHiddenFeeds(ids: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids])); } catch { /* preference only */ }
}
