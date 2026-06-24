import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type { Note, NoteListItem } from '../types';

// ── Individual note query ─────────────────────────────────────────────────────

export function useNote(id: number | null) {
  return useQuery<Note>({
    queryKey: queryKeys.note(id ?? 0),
    queryFn: () => api.notes.get(id!),
    enabled: id !== null,
  });
}

// ── Shared key ────────────────────────────────────────────────────────────────

const NOTE_LIST_KEY = queryKeys.notes;

// ── Helper: shape a Note into a NoteListItem for cache insertion ──────────────

function toListItem(note: Note): NoteListItem {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary,
    section_id: note.section_id,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

// ── Standalone mutation hooks ─────────────────────────────────────────────────

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Note>) => api.notes.create(data),
    onSuccess: (note) => {
      // Prepend the new list item immediately so the sidebar shows it at once.
      queryClient.setQueryData<NoteListItem[]>(NOTE_LIST_KEY, prev => [
        toListItem(note),
        ...(prev ?? []),
      ]);
    },
    onSettled: () => {
      // Background sync to pick up any server-side processing.
      queryClient.invalidateQueries({ queryKey: NOTE_LIST_KEY });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Note> }) =>
      api.notes.update(id, data),
    onSuccess: (note) => {
      // Patch list-panel metadata so the sidebar stays current.
      queryClient.setQueryData<NoteListItem[]>(NOTE_LIST_KEY, prev =>
        (prev ?? []).map(n =>
          n.id === note.id
            ? { ...n, title: note.title, summary: note.summary, section_id: note.section_id, updated_at: note.updated_at }
            : n
        )
      );
      // Patch individual note cache so useNote(id) callers see updated content.
      queryClient.setQueryData<Note>(queryKeys.note(note.id), note);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.notes.delete(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NOTE_LIST_KEY });
      const previous = queryClient.getQueryData<NoteListItem[]>(NOTE_LIST_KEY);
      queryClient.setQueryData<NoteListItem[]>(NOTE_LIST_KEY, prev =>
        (prev ?? []).filter(n => n.id !== id)
      );
      return { previous };
    },

    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(NOTE_LIST_KEY, ctx.previous);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTE_LIST_KEY });
    },
  });
}

// ── Composite hook (used by App and SectionPage) ──────────────────────────────
// Returns the same interface as the old useState-based hook.
//
// auto-save safety: NoteEditor stores title/content in local useState and only
// re-initialises from props when note.id changes.  Background refetches of the
// notes LIST update NoteListItem metadata (title, summary) but never touch
// activeNote (managed separately in App.tsx), so typed content is never clobbered.

export function useNotes() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTE_LIST_KEY,
    queryFn: () => api.notes.list(),
  });

  const createMutation = useCreateNote();
  const deleteMutation = useDeleteNote();

  const notes = query.data ?? [];
  const loading = query.isLoading;
  const error = query.error ? (query.error as Error).message : null;

  const createNote = (data: Partial<Note>): Promise<Note> =>
    createMutation.mutateAsync(data);

  // Synchronous cache patch — called by NoteEditor's onNoteUpdated callback
  // after each auto-save to keep the sidebar list in sync without a round-trip.
  const updateNoteInList = (id: number, updates: Partial<NoteListItem>): void => {
    queryClient.setQueryData<NoteListItem[]>(NOTE_LIST_KEY, prev =>
      (prev ?? []).map(n => (n.id === id ? { ...n, ...updates } : n))
    );
  };

  const deleteNote = (id: number): Promise<void> =>
    deleteMutation.mutateAsync(id);

  const reload = () => queryClient.invalidateQueries({ queryKey: NOTE_LIST_KEY });

  return { notes, loading, error, reload, createNote, updateNoteInList, deleteNote };
}
