import { useState, useEffect } from 'react';
import type { Section, Note, Task } from '../../types';
import { TaskList } from '../tasks/TaskList';
import { NoteList } from '../notes/NoteList';
import { NoteEditor } from '../notes/NoteEditor';
import { useTasksContext } from '../../context/TasksContext';
import { useNotes } from '../../hooks/useNotes';
import { useHabits } from '../../hooks/useHabits';
import { api } from '../../api';
import { CalendarView } from '../calendar/CalendarView';
import { isDue, localDateStr, logToLocalDate, calcCurrentStreak, getMonday, getWeekLogCount } from '../../utils/habitStats';

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
  const { tasks, createTask, updateTask } = useTasksContext();
  const { notes, createNote, updateNoteInList, deleteNote } = useNotes();
  const { habits, logs: habitLogs, logHabit, unlogHabit } = useHabits();
  const [tab, setTab] = useState<'tasks' | 'notes' | 'calendar' | 'habits'>('tasks');
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [editColor, setEditColor] = useState(section.color);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sectionTasks = tasks.filter(t => t.section_id === section.id);
  const activeTasks = sectionTasks.filter(t => t.status !== 'done');
  const sectionNotes = notes.filter(n => n.section_id === section.id);
  const sectionHabits = habits.filter(h => !h.archivedAt && h.sectionId === section.id);

  // Habit log lookups for today
  const todayStr = localDateStr();
  const todayDow = new Date().getDay();
  const todayLogByHabitId = new Map<number, typeof habitLogs[0]>();
  const logDatesByHabitId = new Map<number, Set<string>>();
  habitLogs.forEach(l => {
    const dateStr = logToLocalDate(l.completedAt);
    if (!logDatesByHabitId.has(l.habitId)) logDatesByHabitId.set(l.habitId, new Set());
    logDatesByHabitId.get(l.habitId)!.add(dateStr);
    if (dateStr === todayStr && !todayLogByHabitId.has(l.habitId)) {
      todayLogByHabitId.set(l.habitId, l);
    }
  });

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
        ${tab === t ? 'border-teal-600 text-teal-600 dark:text-teal-400 dark:border-teal-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}>
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
                className="border rounded px-3 py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
              <div className="flex gap-1">
                {PALETTE.map(c => (
                  <button key={c} onClick={() => setEditColor(c)}
                    className={`w-5 h-5 rounded-full ${editColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={handleSaveEdit} className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600">Save</button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
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
              {sectionHabits.length > 0 && (
                <span><strong className="text-gray-800 dark:text-gray-100">{sectionHabits.length}</strong> habits</span>
              )}
            </div>
            <button onClick={() => setEditing(true)} className="p-1.5 text-gray-400 hover:text-teal-600 dark:text-gray-500 dark:hover:text-teal-400 rounded" title="Edit section">
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
        {tabBtn('habits', `Habits (${sectionHabits.length})`)}
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
                    <button onClick={handleNewNote} className="text-teal-600 dark:text-teal-400 hover:underline text-sm">Create a note in this section</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'calendar' && (
          <div className="h-full overflow-y-auto">
            <CalendarView tasks={tasks} sections={sections} onUpdateTask={updateTask} onCreateTask={createTask} onCreateSection={onCreateSection} filterSectionId={section.id} />
          </div>
        )}

        {tab === 'habits' && (
          <div className="h-full overflow-y-auto py-2">
            {sectionHabits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <p className="text-3xl mb-3">ðŸ"¥</p>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No habits in this section.</p>
                <p className="text-xs mt-1">Assign habits to this section from the Habits page.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sectionHabits.map(habit => {
                  const logDates = logDatesByHabitId.get(habit.id) ?? new Set<string>();
                  const todayLog = todayLogByHabitId.get(habit.id) ?? null;
                  const streak = calcCurrentStreak(habit, logDates);
                  const dueToday = habit.frequency === 'weekly_count'
                    ? getWeekLogCount(logDates, getMonday(new Date())) < (habit.targetCount ?? 1)
                    : isDue(habit, todayDow);
                  const unitLabel = habit.frequency === 'daily' ? 'day' : 'wk';
                  const done = !!todayLog;
                  const weekCount = habit.frequency === 'weekly_count'
                    ? getWeekLogCount(logDates, getMonday(new Date()))
                    : null;

                  const habitSubtitle = () => {
                    if (habit.frequency === 'weekly_count') {
                      if (done) return <span className="text-green-600 dark:text-green-400 font-medium">&#10003; Logged &mdash; {weekCount}/{habit.targetCount} this week</span>;
                      return `${weekCount}/${habit.targetCount} this week`;
                    }
                    if (done) return <span className="text-green-600 dark:text-green-400 font-medium">&#10003; Done today</span>;
                    if (streak > 0) return `🔥 ${streak} ${unitLabel}${streak !== 1 ? 's' : ''}`;
                    return dueToday ? 'Due today' : habit.frequency;
                  };

                  return (
                    <div key={habit.id} className="relative flex items-center gap-3 p-4 rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg" style={{ backgroundColor: habit.color }} />
                      <span className="text-xl leading-none flex-shrink-0">{habit.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium leading-snug ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                          {habit.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{habitSubtitle()}</p>
                      </div>
                      {dueToday && (
                        <button
                          onClick={() => done ? unlogHabit(todayLog!.id) : logHabit(habit.id)}
                          title={done ? 'Mark incomplete' : 'Mark complete'}
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 active:scale-95 ${done ? 'text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600'}`}
                          style={done ? { backgroundColor: habit.color } : {}}
                          onMouseEnter={e => { if (!done) (e.currentTarget as HTMLElement).style.backgroundColor = habit.color + '33'; }}
                          onMouseLeave={e => { if (!done) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

