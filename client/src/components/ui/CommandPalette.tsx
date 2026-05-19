import { useState, useEffect, useRef, useMemo } from 'react';
import { useTasksContext } from '../../context/TasksContext';
import type { Section } from '../../types';

type NavView = 'today' | 'tasks' | 'calendar' | 'notes' | 'habits' | { type: 'section'; id: number };

interface CommandPaletteProps {
  sections: Section[];
  onNavigate: (view: NavView) => void;
  onClose: () => void;
}

const NAV_ITEMS: { view: NavView; label: string; desc: string }[] = [
  { view: 'today',    label: 'Today',    desc: 'Your focus list' },
  { view: 'tasks',    label: 'Tasks',    desc: 'Browse all tasks' },
  { view: 'calendar', label: 'Calendar', desc: 'Tasks by deadline' },
  { view: 'notes',    label: 'Notes',    desc: 'Your notes' },
  { view: 'habits',   label: 'Habits',   desc: 'Habit tracker' },
];

type Result =
  | { kind: 'create'; query: string }
  | { kind: 'nav'; view: NavView; label: string; desc: string }
  | { kind: 'section'; id: number; label: string; color: string }
  | { kind: 'task'; id: number; label: string; priority: string };

export function CommandPalette({ sections, onNavigate, onClose }: CommandPaletteProps) {
  const { tasks, createTask } = useTasksContext();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.toLowerCase().trim();

    if (!q) {
      return [
        ...NAV_ITEMS.map(n => ({ kind: 'nav' as const, ...n })),
        ...sections.map(s => ({ kind: 'section' as const, id: s.id, label: s.name, color: s.color })),
      ];
    }

    return [
      { kind: 'create' as const, query: query.trim() },
      ...NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q)).map(n => ({ kind: 'nav' as const, ...n })),
      ...sections.filter(s => s.name.toLowerCase().includes(q)).map(s => ({ kind: 'section' as const, id: s.id, label: s.name, color: s.color })),
      ...tasks
        .filter(t => t.status !== 'done' && t.title.toLowerCase().includes(q))
        .slice(0, 5)
        .map(t => ({ kind: 'task' as const, id: t.id, label: t.title, priority: t.priority })),
    ];
  }, [query, tasks, sections]);

  useEffect(() => { setSelected(0); }, [results]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const execute = async (result: Result) => {
    switch (result.kind) {
      case 'create':
        await createTask({ title: result.query, priority: 'medium' });
        onNavigate('tasks');
        onClose();
        break;
      case 'nav':
        onNavigate(result.view);
        onClose();
        break;
      case 'section':
        onNavigate({ type: 'section', id: result.id });
        onClose();
        break;
      case 'task':
        onNavigate('tasks');
        onClose();
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected(s => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected(s => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      execute(results[selected]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/40 dark:bg-black/60 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 bg-white dark:bg-gray-800 rounded shadow-2xl overflow-hidden animate-slide-down"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to, search tasks, or type to create..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <kbd className="text-xs text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 font-mono">esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-72 py-1">
          {results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No results</p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => execute(r)}
              onMouseEnter={() => setSelected(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer
                ${i === selected ? 'bg-teal-50 dark:bg-teal-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              {r.kind === 'create' && (
                <>
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-orange-100 dark:bg-orange-900/30 flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">
                    Create task <span className="font-semibold text-gray-900 dark:text-white">"{r.query}"</span>
                  </span>
                </>
              )}
              {r.kind === 'nav' && (
                <>
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">{r.label}</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{r.desc}</span>
                </>
              )}
              {r.kind === 'section' && (
                <>
                  <span className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: r.color + '22' }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                  </span>
                  <span className="text-gray-700 dark:text-gray-200">{r.label}</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Section</span>
                </>
              )}
              {r.kind === 'task' && (
                <>
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-gray-700 dark:text-gray-200 truncate">{r.label}</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Task</span>
                </>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 font-mono">↵</kbd> select
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
