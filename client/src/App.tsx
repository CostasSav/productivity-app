import { useState, useEffect } from 'react';
import { TaskList } from './components/tasks/TaskList';
import { NoteList } from './components/notes/NoteList';
import { NoteEditor } from './components/notes/NoteEditor';
import { CalendarView } from './components/calendar/CalendarView';
import { SectionPage } from './components/sections/SectionPage';
import { PomodoroPanel } from './components/PomodoroPanel';
import { CommandPalette } from './components/ui/CommandPalette';
import { WelcomeScreen } from './components/ui/WelcomeScreen';
import { DottedSurface } from './components/ui/dotted-surface';
import { Today } from './pages/Today';
import { Habits } from './pages/Habits';
import { Gratitude } from './pages/Gratitude';
import { Settings } from './pages/Settings';
import { Grocery } from './pages/Grocery';
import { Sleep } from './pages/Sleep';
import { Bibliotheca } from './pages/Bibliotheca';
import { useNotes } from './hooks/useNotes';
import { useTasksContext } from './context/TasksContext';
import { useSections } from './hooks/useSections';
import { useDarkMode } from './context/DarkModeContext';
import { api } from './api';
import type { Note, Task } from './types';

const WELCOME_KEY = 'workspace_welcome_seen';

type View = 'today' | 'tasks' | 'calendar' | 'notes' | 'habits' | 'gratitude' | 'grocery' | 'sleep' | 'bibliotheca' | 'settings' | { type: 'section'; id: number };

// â"€â"€ Inline SVG icon helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function Icon({ d, d2, className = 'w-4 h-4 flex-shrink-0' }: { d: string; d2?: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {d2 && <path strokeLinecap="round" strokeLinejoin="round" d={d2} />}
    </svg>
  );
}

// â"€â"€ App â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export default function App() {
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY));
  const [view, setView] = useState<View>('today');
  const [collapsed, setCollapsed] = useState(false);

  const handleDismissWelcome = () => {
    localStorage.setItem(WELCOME_KEY, '1');
    setShowWelcome(false);
  };
  const { notes, loading: notesLoading, createNote, updateNoteInList, deleteNote } = useNotes();
  const { tasks, createTask, updateTask } = useTasksContext();
  const { sections, createSection, updateSection, deleteSection } = useSections();
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [focusTask, setFocusTask] = useState<{ id: number; title: string } | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const { dark, toggle } = useDarkMode();
  const [moreExpanded, setMoreExpanded] = useState(() => localStorage.getItem('sidebar_more_expanded') === 'true');
  const [sectionsExpanded, setSectionsExpanded] = useState(() => localStorage.getItem('sidebar_sections_expanded') === 'true');
  const [missingSleepEntry, setMissingSleepEntry] = useState(false);
  const [sleepBannerVisible, setSleepBannerVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(p => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!selectedNoteId && notes.length > 0) setSelectedNoteId(notes[0].id);
  }, [notes]);

  useEffect(() => {
    const init = async () => {
      try {
        const s = await api.gratitudeSettings.get();
        if (s.reminderEnabled && 'Notification' in window) {
          const asked = localStorage.getItem('notif_permission_asked');
          if (!asked) {
            localStorage.setItem('notif_permission_asked', '1');
            Notification.requestPermission().catch(() => {});
          }
        }
      } catch {}
    };
    init();

    const interval = setInterval(async () => {
      try {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        const s = await api.gratitudeSettings.get();
        if (!s.reminderEnabled) return;
        const [h, m] = (s.reminderTime || '21:00').split(':').map(Number);
        const now = new Date();
        if (now.getHours() !== h || now.getMinutes() !== m) return;
        const entry = await api.gratitude.today();
        if (!entry) {
          const notif = new Notification('Evening gratitude 🌿', {
            body: '2 minutes to reflect on your day.',
          });
          notif.onclick = () => window.focus();
        }
      } catch {}
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedNoteId) { setActiveNote(null); return; }
    api.notes.get(selectedNoteId).then(setActiveNote).catch(() => {});
  }, [selectedNoteId]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 12) return;
    const today = new Date().toISOString().split('T')[0];
    const dismissed = localStorage.getItem('sleepBannerDismissedDate');
    if (dismissed === today) return;
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yStr = yest.toISOString().split('T')[0];
    api.sleep.getByDate(yStr).then(entry => {
      if (!entry) { setMissingSleepEntry(true); setSleepBannerVisible(true); }
    }).catch(() => {});
  }, []);

  const handleNewNote = async (sectionId?: number | null) => {
    const note = await createNote({ title: 'New Note', content: '', section_id: sectionId ?? null });
    setSelectedNoteId(note.id);
    setView('notes');
  };

  const handleDeleteNote = async (id: number) => {
    await deleteNote(id);
    if (selectedNoteId === id) {
      const remaining = notes.filter(n => n.id !== id);
      setSelectedNoteId(remaining[0]?.id ?? null);
    }
  };

  const handleUpdateNote = async (id: number, data: Partial<Note>) => {
    const updated = await api.notes.update(id, data);
    setActiveNote(updated);
    return updated;
  };

  const handleNoteUpdated = (id: number, updates: { title: string; summary: string | null; section_id: number | null }) => {
    updateNoteInList(id, updates);
  };

  const handleFocusTask = (task: Task) => {
    if (focusTask?.id === task.id) return;
    if (isTimerRunning && !window.confirm(`Switch to "${task.title}"? The current session will be lost.`)) return;
    setIsTimerRunning(false);
    setFocusTask({ id: task.id, title: task.title });
  };

  const handleClosePanel = () => {
    setFocusTask(null);
    setIsTimerRunning(false);
  };

  const handleDeleteSection = async (id: number) => {
    await deleteSection(id);
    setView('tasks');
  };

  const handleEditSection = async (id: number, name: string, color: string) => {
    await updateSection(id, { name, color });
  };

  const currentSectionId = typeof view === 'object' && view.type === 'section' ? view.id : null;
  const currentSection = currentSectionId ? sections.find(s => s.id === currentSectionId) : null;

  const isActive = (v: View) => {
    if (typeof v === 'string' && typeof view === 'string') return v === view;
    if (typeof v === 'object' && typeof view === 'object') return v.id === (view as any).id;
    return false;
  };

  const navBtn = (v: View, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setView(v)}
      title={collapsed ? label : undefined}
      className={`flex items-center w-full rounded text-sm font-medium transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
        ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'}
        ${isActive(v)
          ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'}`}
    >
      {icon}
      {!collapsed && label}
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#111113] font-sans">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-14' : 'w-52'} flex-shrink-0 border-r border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#09090b] flex flex-col py-4 px-2 gap-1 overflow-y-auto overflow-x-hidden transition-all duration-300`}>

        {/* Brand mark */}
        <div className={`flex items-center gap-2.5 mb-4 ${collapsed ? 'justify-center px-1' : 'px-2'}`}>
          <div className="w-7 h-7 bg-teal-600 rounded flex items-center justify-center flex-shrink-0 shadow-sm">
            <Icon d="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">My Workspace</h1>}
        </div>

        {/* Main nav - always visible */}
        {navBtn('tasks',    'Tasks',    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />)}
        {navBtn('today',    'Today',    <Icon d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />)}
        {navBtn('calendar', 'Calendar', <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />)}
        {navBtn('habits',   'Habits',   <Icon d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />)}

        {/* Notes + Gratitude: icon-only in collapsed sidebar, else behind "More" toggle */}
        {collapsed && navBtn('notes', 'Notes', <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />)}
        {collapsed && navBtn('gratitude', 'Gratitude', <Icon d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />)}
        {collapsed && navBtn('grocery', 'Grocery', <Icon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />)}
        {collapsed && (
          <div className="relative">
            {navBtn('sleep', 'Sleep', <Icon d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />)}
            {missingSleepEntry && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 pointer-events-none" />}
          </div>
        )}
        {collapsed && navBtn('bibliotheca', 'Bibliotheca', <Icon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />)}

        {/* "More" expandable area - only in expanded sidebar */}
        {!collapsed && (
          <div className="mt-2">
            <button
              onClick={() => {
                const next = !moreExpanded;
                setMoreExpanded(next);
                localStorage.setItem('sidebar_more_expanded', String(next));
              }}
              className="flex items-center w-full px-3 py-1 text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide hover:text-gray-600 dark:hover:text-zinc-300 transition-colors cursor-pointer rounded"
            >
              <span>More</span>
              <svg
                className={`w-3 h-3 ml-auto transition-transform duration-200 ${moreExpanded ? 'rotate-0' : '-rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {moreExpanded && navBtn('notes', 'Notes', <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />)}
            {moreExpanded && navBtn('gratitude', 'Gratitude', <Icon d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />)}
            {moreExpanded && navBtn('grocery', 'Grocery', <Icon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />)}
            {moreExpanded && (
              <div className="relative">
                {navBtn('sleep', 'Sleep', <Icon d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />)}
                {missingSleepEntry && <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-amber-400 pointer-events-none" />}
              </div>
            )}
            {moreExpanded && navBtn('bibliotheca', 'Bibliotheca', <Icon d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />)}
          </div>
        )}

        {/* Sections - hidden when collapsed */}
        {!collapsed && (
          <>
            <div className="mt-4 mb-1 px-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Sections</p>
            </div>
            {(sectionsExpanded ? sections : sections.slice(0, 4)).map(s => (
              <button
                key={s.id}
                onClick={() => setView({ type: 'section', id: s.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
                  ${isActive({ type: 'section', id: s.id })
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100'}`}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
            {sections.length > 4 && (
              <button
                onClick={() => {
                  const next = !sectionsExpanded;
                  setSectionsExpanded(next);
                  localStorage.setItem('sidebar_sections_expanded', String(next));
                }}
                className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {sectionsExpanded
                  ? <><Icon d="M5 15l7-7 7 7" className="w-3 h-3 flex-shrink-0" /> Show less</>
                  : <><Icon d="M19 9l-7 7-7-7" className="w-3 h-3 flex-shrink-0" /> {sections.length - 4} more</>}
              </button>
            )}
            <button
              onClick={async () => {
                const name = prompt('Section name:');
                if (!name?.trim()) return;
                const s = await createSection(name.trim(), '#6366f1');
                setView({ type: 'section', id: s.id });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:text-zinc-500 dark:hover:text-teal-400 dark:hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
            >
              <Icon d="M12 4v16m8-8H4" className="w-3.5 h-3.5 flex-shrink-0" />
              New section
            </button>
          </>
        )}

        {/* Bottom controls */}
        <div className="mt-auto flex flex-col gap-1 pt-2">
          {navBtn('settings', 'Settings', <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" d2="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />)}
          <button
            onClick={toggle}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`flex items-center w-full rounded text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/[0.06] transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
              ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5'}`}
          >
            {dark
              ? <Icon d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              : <Icon d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            }
            {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
          </button>

          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex items-center w-full rounded text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-white/[0.06] transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
              ${collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2.5'}`}
          >
            <svg className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!collapsed && 'Collapse'}
          </button>

        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden relative isolate">

        {/* Morning sleep log reminder banner */}
        {sleepBannerVisible && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 z-10">
            <span className="text-sm text-amber-800 dark:text-amber-200">🌙 Don't forget to log last night's sleep</span>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <button
                onClick={() => setView('sleep')}
                className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
              >
                Log now
              </button>
              <button
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  localStorage.setItem('sleepBannerDismissedDate', today);
                  setSleepBannerVisible(false);
                }}
                className="text-lg leading-none text-amber-400 hover:text-amber-700 dark:hover:text-amber-200 cursor-pointer"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* View content */}
        <div className="flex-1 flex overflow-hidden relative">
        {view === 'today' && <DottedSurface />}
        {view === 'today' && (
          <div className="flex-1 overflow-y-auto animate-fade-in">
            <Today onFocusTask={handleFocusTask} onNavigateGratitude={() => setView('gratitude')} onNavigateGrocery={() => setView('grocery')} onNavigateSleep={() => setView('sleep')} />
          </div>
        )}
        {view === 'tasks' && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            <TaskList sections={sections} onCreateSection={createSection} onFocusTask={handleFocusTask} />
          </div>
        )}
        {view === 'calendar' && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            <CalendarView tasks={tasks} sections={sections} onUpdateTask={updateTask} onCreateTask={createTask} onCreateSection={createSection} />
          </div>
        )}
        {view === 'habits' && (
          <div className="flex-1 overflow-y-auto animate-fade-in">
            <Habits />
          </div>
        )}
        {view === 'gratitude' && (
          <div className="flex-1 overflow-y-auto animate-fade-in flex flex-col">
            <Gratitude />
          </div>
        )}
        {view === 'settings' && (
          <div className="flex-1 overflow-y-auto animate-fade-in">
            <Settings />
          </div>
        )}
        {view === 'grocery' && (
          <div className="flex-1 flex overflow-hidden animate-fade-in">
            <Grocery />
          </div>
        )}
        {view === 'sleep' && (
          <div className="flex-1 flex overflow-hidden animate-fade-in">
            <Sleep onEntrySaved={(date: string) => {
              const yest = new Date();
              yest.setDate(yest.getDate() - 1);
              const yStr = yest.toISOString().split('T')[0];
              const tStr = new Date().toISOString().split('T')[0];
              if (date === yStr || date === tStr) {
                setMissingSleepEntry(false);
                setSleepBannerVisible(false);
              }
            }} />
          </div>
        )}
        {view === 'bibliotheca' && (
          <div className="flex-1 flex overflow-hidden animate-fade-in">
            <Bibliotheca />
          </div>
        )}
        {view === 'notes' && (
          <div className="flex-1 flex overflow-hidden animate-fade-in">
            <NoteList
              notes={notes} sections={sections} loading={notesLoading}
              selectedId={selectedNoteId} onSelect={id => setSelectedNoteId(id)}
              onNew={() => handleNewNote()} onDelete={handleDeleteNote}
            />
            <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-[#111113]">
              {activeNote ? (
                <NoteEditor
                  key={activeNote.id} note={activeNote} sections={sections}
                  onUpdate={handleUpdateNote} onTasksAdded={() => {}}
                  onNoteUpdated={handleNoteUpdated} onCreateSection={createSection}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-2">No note selected</p>
                    <button onClick={() => handleNewNote()} className="text-teal-600 hover:underline text-sm dark:text-teal-400 cursor-pointer">Create a new note</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {typeof view === 'object' && view.type === 'section' && currentSection && (
          <div className="flex-1 overflow-y-auto p-8 animate-fade-in">
            <SectionPage
              key={currentSection.id} section={currentSection} sections={sections}
              onCreateSection={createSection} onEditSection={handleEditSection}
              onDeleteSection={handleDeleteSection} onFocusTask={handleFocusTask}
            />
          </div>
        )}
        </div>{/* end view content */}
      </main>

      {focusTask && (
        <PomodoroPanel
          task={focusTask} isTimerRunning={isTimerRunning}
          onRunningChange={setIsTimerRunning} onClose={handleClosePanel}
        />
      )}

      {showPalette && (
        <CommandPalette
          sections={sections}
          onNavigate={v => setView(v as View)}
          onClose={() => setShowPalette(false)}
        />
      )}

      {showWelcome && <WelcomeScreen onDismiss={handleDismissWelcome} />}

    </div>
  );
}

