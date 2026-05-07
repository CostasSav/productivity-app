import { useState, useEffect } from 'react';
import { TaskList } from './components/tasks/TaskList';
import { NoteList } from './components/notes/NoteList';
import { NoteEditor } from './components/notes/NoteEditor';
import { CalendarView } from './components/calendar/CalendarView';
import { SectionPage } from './components/sections/SectionPage';
import { PomodoroPanel } from './components/PomodoroPanel';
import { Today } from './pages/Today';
import { useNotes } from './hooks/useNotes';
import { useTasks } from './hooks/useTasks';
import { useSections } from './hooks/useSections';
import { useDarkMode } from './context/DarkModeContext';
import { api } from './api';
import type { Note, Task } from './types';

type View = 'today' | 'tasks' | 'calendar' | 'notes' | { type: 'section'; id: number };

export default function App() {
  const [view, setView] = useState<View>('today');
  const { notes, loading: notesLoading, createNote, updateNoteInList, deleteNote } = useNotes();
  const { tasks, createTask, updateTask } = useTasks();
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

  const navBtn = (v: View, label: string, icon: string) => (
    <button
      onClick={() => setView(v)}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
        ${isActive(v)
          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
          : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}
    >
      <span className="text-lg">{icon}</span> {label}
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col py-6 px-3 gap-1 overflow-y-auto">
        <div className="px-3 mb-4">
          <h1 className="text-base font-bold text-gray-900 dark:text-white">My Workspace</h1>
        </div>
        {navBtn('today', 'Today', '☀')}
        {navBtn('tasks', 'Tasks', '✓')}
        {navBtn('calendar', 'Calendar', '▦')}
        {navBtn('notes', 'Notes', '◉')}

        {/* Sections */}
        <div className="mt-4 mb-1 px-3">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Sections</p>
        </div>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setView({ type: 'section', id: s.id })}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive({ type: 'section', id: s.id })
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
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
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-indigo-400"
        >
          <span className="text-lg">+</span> New section
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="mt-auto flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {dark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          {dark ? 'Light mode' : 'Dark mode'}
        </button>
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
            <CalendarView
              tasks={tasks}
              sections={sections}
              onUpdateTask={updateTask}
              onCreateTask={createTask}
              onCreateSection={createSection}
            />
          </div>
        )}

        {view === 'notes' && (
          <div className="flex-1 flex overflow-hidden">
            <NoteList
              notes={notes}
              sections={sections}
              loading={notesLoading}
              selectedId={selectedNoteId}
              onSelect={id => setSelectedNoteId(id)}
              onNew={() => handleNewNote()}
              onDelete={handleDeleteNote}
            />
            <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-800">
              {activeNote ? (
                <NoteEditor
                  key={activeNote.id}
                  note={activeNote}
                  sections={sections}
                  onUpdate={handleUpdateNote}
                  onTasksAdded={() => {}}
                  onNoteUpdated={handleNoteUpdated}
                  onCreateSection={createSection}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-2">No note selected</p>
                    <button onClick={() => handleNewNote()} className="text-indigo-600 hover:underline text-sm dark:text-indigo-400">Create a new note</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {typeof view === 'object' && view.type === 'section' && currentSection && (
          <div className="flex-1 overflow-y-auto p-8">
            <SectionPage
              key={currentSection.id}
              section={currentSection}
              sections={sections}
              onCreateSection={createSection}
              onEditSection={handleEditSection}
              onDeleteSection={handleDeleteSection}
              onFocusTask={handleFocusTask}
            />
          </div>
        )}
      </main>

      {focusTask && (
        <PomodoroPanel
          task={focusTask}
          isTimerRunning={isTimerRunning}
          onRunningChange={setIsTimerRunning}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
