import { useState, useEffect } from 'react';
import type { Section, Note, Task } from '../../types';
import { TaskList } from '../tasks/TaskList';
import { NoteList } from '../notes/NoteList';
import { NoteEditor } from '../notes/NoteEditor';
import { useTasks } from '../../hooks/useTasks';
import { useNotes } from '../../hooks/useNotes';
import { api } from '../../api';
import { CalendarView } from '../calendar/CalendarView';

interface SectionPageProps {
  section: Section;
  sections: Section[];
  onCreateSection: (name: string, color: string) => Promise<Section>;
  onEditSection: (id: number, name: string, color: string) => Promise<void>;
  onDeleteSection: (id: number) => Promise<void>;
  onFocusTask?: (task: Task) => void;
}

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

export function SectionPage({ section, sections, onCreateSection, onEditSection, onDeleteSection, onFocusTask }: SectionPageProps) {
  const { tasks } = useTasks();
  const { notes, createNote, updateNoteInList, deleteNote } = useNotes();
  const [tab, setTab] = useState<'tasks' | 'notes' | 'calendar'>('tasks');
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [editColor, setEditColor] = useState(section.color);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sectionTasks = tasks.filter(t => t.section_id === section.id);
  const activeTasks = sectionTasks.filter(t => t.status !== 'done');
  const sectionNotes = notes.filter(n => n.section_id === section.id);

  useEffect(() => {
    if (!selectedNoteId && sectionNotes.length > 0) setSelectedNoteId(sectionNotes[0].id);
  }, [sectionNotes.length]);

  useEffect(() => {
    if (!selectedNoteId) { setActiveNote(null); return; }
    api.notes.get(selectedNoteId).then(setActiveNote).catch(() => {});
  }, [selectedNoteId]);

  const handleNewNote = async () => {
    const note = await createNote({ title: 'New Note', content: '', section_id: section.id });
    setSelectedNoteId(note.id);
    setTab('notes');
  };

  const handleDeleteNote = async (id: number) => {
    await deleteNote(id);
    if (selectedNoteId === id) {
      const remaining = sectionNotes.filter(n => n.id !== id);
      setSelectedNoteId(remaining[0]?.id ?? null);
    }
  };

  const handleUpdateNote = async (id: number, data: Partial<Note>) => {
    const updated = await api.notes.update(id, data);
    setActiveNote(updated);
    return updated;
  };

  const handleSaveEdit = async () => {
    await onEditSection(section.id, editName.trim() || section.name, editColor);
    setEditing(false);
  };

  const handleDelete = async () => {
    await onDeleteSection(section.id);
  };

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors
        ${tab === t ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
          {editing ? (
            <div className="flex items-center gap-2">
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
              <div className="flex gap-1">
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setEditColor(c)}
                    className={`w-5 h-5 rounded-full ${editColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={handleSaveEdit} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{section.name}</h1>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <div className="flex gap-3 text-sm text-gray-500 dark:text-gray-400 mr-4">
              <span><strong className="text-gray-800 dark:text-gray-100">{activeTasks.length}</strong> active tasks</span>
              <span><strong className="text-gray-800 dark:text-gray-100">{sectionNotes.length}</strong> notes</span>
            </div>
            <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 rounded" title="Edit section">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 dark:text-red-400">Delete section?</span>
                <button onClick={handleDelete} className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Yes, delete</button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 rounded" title="Delete section">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {tabBtn('tasks', `Tasks (${activeTasks.length})`)}
        {tabBtn('notes', `Notes (${sectionNotes.length})`)}
        {tabBtn('calendar', 'Calendar')}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'tasks' && (
          <div className="h-full overflow-y-auto">
            <TaskList sections={sections} onCreateSection={onCreateSection} filterSectionId={section.id} title="" onFocusTask={onFocusTask} />
          </div>
        )}

        {tab === 'notes' && (
          <div className="flex h-full overflow-hidden">
            <NoteList notes={sectionNotes} sections={sections} loading={false} selectedId={selectedNoteId} filterSectionId={section.id} onSelect={setSelectedNoteId} onNew={handleNewNote} onDelete={handleDeleteNote} />
            <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-800">
              {activeNote ? (
                <NoteEditor key={activeNote.id} note={activeNote} sections={sections} onUpdate={handleUpdateNote} onTasksAdded={() => {}} onNoteUpdated={(id, updates) => updateNoteInList(id, updates)} onCreateSection={onCreateSection} />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <div className="text-center">
                    <p className="mb-2">No note selected</p>
                    <button onClick={handleNewNote} className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">Create a note in this section</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'calendar' && (
          <div className="h-full overflow-y-auto">
            <CalendarView tasks={tasks} sections={sections} onUpdateTask={(id, data) => api.tasks.update(id, data as Partial<Task>)} onCreateTask={data => api.tasks.create(data as Partial<Task>)} onCreateSection={onCreateSection} filterSectionId={section.id} />
          </div>
        )}
      </div>
    </div>
  );
}
