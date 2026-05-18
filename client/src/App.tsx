import { useState, useEffect } from 'react';
import { TaskList } from './components/tasks/TaskList';
import { NoteList } from './components/notes/NoteList';
import { NoteEditor } from './components/notes/NoteEditor';
import { CalendarView } from './components/calendar/CalendarView';
import { SectionPage } from './components/sections/SectionPage';
import { PomodoroPanel } from './components/PomodoroPanel';
import { Today } from './pages/Today';
import { Habits } from './pages/Habits';
import { useNotes } from './hooks/useNotes';
import { useTasksContext } from './context/TasksContext';
import { useSections } from './hooks/useSections';
import { useDarkMode } from './context/DarkModeContext';
import { api } from './api';
import type { Note, Task } from './types';

type View = 'today' | 'tasks' | 'calendar' | 'notes' | 'habits' | { type: 'section'; id: number };

// â”€â”€ Inline SVG icon helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Icon({ d, d2, className = 'w-4 h-4 flex-shrink-0' }: { d: string; d2?: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      {d2 && <path strokeLinecap="round" strokeLinejoin="round" d={d2} />}
    </svg>
  );
}

// â”€â”€ App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function App() {
  const [view, setView] = useState<View>('today');
  const [collapsed, setCollapsed] = useState(false);
  const { notes, loading: notesLoading, createNote, updateNoteInList, deleteNote } = useNotes();
  const { tasks, createTask, updateTask } = useTasksContext();
  const { sections, createSection, updateSection, deleteSection } = useSections();
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [focusTask, setFocusTask] = useState<{ id: number; title: string } | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const { dark, toggle } = useDarkMode();

  useEffect(() => {
    if (!selectedNoteId && notes.length > 0) setSelectedNoteId(notes[0].id);
  }, [notes]);

  useEffect(() => {
    if (!selectedNoteId) { setActiveNote(null); return; }
    api.notes.get(selectedNoteId).then(setActiveNote).catch(() => {});
  }, [selectedNoteId]);

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
          ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}
    >
      {icon}
      {!collapsed && label}
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-14' : 'w-52'} flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col py-4 px-2 gap-1 overflow-y-auto overflow-x-hidden transition-all duration-300`}>

        {/* Brand mark */}
        <div className={`flex items-center gap-2.5 mb-4 ${collapsed ? 'justify-center px-1' : 'px-2'}`}>
          <div className="w-7 h-7 bg-teal-600 rounded flex items-center justify-center flex-shrink-0 shadow-sm">
            <Icon d="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">My Workspace</h1>}
        </div>

        {navBtn('today',    'Today',    <Icon d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />)}
        {navBtn('tasks',    'Tasks',    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />)}
        {navBtn('calendar', 'Calendar', <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />)}
        {navBtn('notes',    'Notes',    <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />)}
        {navBtn('habits',   'Habits',   <Icon d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />)}

        {/* Sections â€” hidden when collapsed */}
        {!collapsed && (
          <>
            <div className="mt-4 mb-1 px-3">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Sections</p>
            </div>
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setView({ type: 'section', id: s.id })}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded text-sm font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1
                  ${isActive({ type: 'section', id: s.id })
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}
              >
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
            <button
              onClick={async () => {
                const name = prompt('Section name:');
                if (!name?.trim()) return;
                const s = await createSection(name.trim(), '#6366f1');
                setView({ type: 'section', id: s.id });
              }}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-gray-400 hover:text-teal-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-teal-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
            >
              <Icon d="M12 4v16m8-8H4" className="w-3.5 h-3.5 flex-shrink-0" />
              New section
            </button>
          </>
        )}

        {/* Bottom controls */}
        <div className="mt-auto flex flex-col gap-1 pt-2">
          <button
            onClick={toggle}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`flex items-center w-full rounded text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
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
            className={`flex items-center w-full rounded text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
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
      <main className="flex-1 flex overflow-hidden">
        {view === 'today' && (
          <div className="flex-1 overflow-y-auto">
            <Today onFocusTask={handleFocusTask} />
          </div>
        )}
        {view === 'tasks' && (
          <div className="flex-1 overflow-y-auto p-8">
            <TaskList sections={sections} onCreateSection={createSection} onFocusTask={handleFocusTask} />
          </div>
        )}
        {view === 'calendar' && (
          <div className="flex-1 overflow-y-auto p-8">
            <CalendarView tasks={tasks} sections={sections} onUpdateTask={updateTask} onCreateTask={createTask} onCreateSection={createSection} />
          </div>
        )}
        {view === 'habits' && (
          <div className="flex-1 overflow-y-auto">
            <Habits />
          </div>
        )}
        {view === 'notes' && (
          <div className="flex-1 flex overflow-hidden">
            <NoteList
              notes={notes} sections={sections} loading={notesLoading}
              selectedId={selectedNoteId} onSelect={id => setSelectedNoteId(id)}
              onNew={() => handleNewNote()} onDelete={handleDeleteNote}
            />
            <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-800">
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
          <div className="flex-1 overflow-y-auto p-8">
            <SectionPage
              key={currentSection.id} section={currentSection} sections={sections}
              onCreateSection={createSection} onEditSection={handleEditSection}
              onDeleteSection={handleDeleteSection} onFocusTask={handleFocusTask}
            />
          </div>
        )}
      </main>

      {focusTask && (
        <PomodoroPanel
          task={focusTask} isTimerRunning={isTimerRunning}
          onRunningChange={setIsTimerRunning} onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

