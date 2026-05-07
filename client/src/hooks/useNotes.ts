import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { NoteListItem, Note } from '../types';

export function useNotes() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.notes.list();
      setNotes(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNote = async (data: Partial<Note>) => {
    const note = await api.notes.create(data);
    setNotes(prev => [{ id: note.id, title: note.title, summary: note.summary, section_id: note.section_id, created_at: note.created_at, updated_at: note.updated_at }, ...prev]);
    return note;
  };

  const updateNoteInList = (id: number, updates: Partial<NoteListItem>) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...updates } : n)));
  };

  const deleteNote = async (id: number) => {
    await api.notes.delete(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  return { notes, loading, error, reload: load, createNote, updateNoteInList, deleteNote };
}
