import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { queryKeys } from '../lib/queryKeys';
import type {
  BookWithCounts, BookNote, BookQuote, BookLearning,
  BibliothecaSettings, BookStats, BookStatus,
} from '../types';

// ── Exported key constants (for direct cache manipulation in components) ───────

export const BOOKS_KEY                = queryKeys.books();
export const BOOK_STATS_KEY           = queryKeys.bookStats;
export const BIBLIOTHECA_SETTINGS_KEY = queryKeys.bibliothecaSettings;

// ── Book mutations ─────────────────────────────────────────────────────────────

type BookPayload = {
  title: string; author?: string | null; totalPages?: number | null;
  currentPage?: number; genre?: string | null; tags?: string[];
  status?: BookStatus; coverUrl?: string | null; openLibraryKey?: string | null;
  synopsis?: string | null; dnfReason?: string | null; recommendedBy?: string | null;
  startedAt?: string | null; finishedAt?: string | null; rating?: number | null;
  wantToReadOrder?: number;
};

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BookPayload) => api.books.create(data as any),
    onSuccess: (book) => {
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, prev =>
        [book as BookWithCounts, ...(prev ?? [])]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
      queryClient.invalidateQueries({ queryKey: BOOK_STATS_KEY });
    },
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BookPayload> }) =>
      api.books.update(id, data as any),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: BOOKS_KEY });
      const prev = queryClient.getQueryData<BookWithCounts[]>(BOOKS_KEY);
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, old =>
        old?.map(b => b.id === id ? ({ ...b, ...data } as BookWithCounts) : b)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(BOOKS_KEY, ctx.prev);
    },
    onSuccess: (book, { data }) => {
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, old =>
        old?.map(b => b.id === book.id ? ({ ...b, ...book } as BookWithCounts) : b)
      );
      if (data.status === 'finished') {
        queryClient.invalidateQueries({ queryKey: BOOK_STATS_KEY });
        queryClient.invalidateQueries({ queryKey: BIBLIOTHECA_SETTINGS_KEY });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.books.delete(id),
    onSuccess: (_void, id) => {
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, prev =>
        prev?.filter(b => b.id !== id)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
      queryClient.invalidateQueries({ queryKey: BOOK_STATS_KEY });
      queryClient.invalidateQueries({ queryKey: BIBLIOTHECA_SETTINGS_KEY });
    },
  });
}

export function useUpdateBookPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, currentPage }: { id: number; currentPage: number }) =>
      api.books.update(id, { currentPage }),
    onMutate: async ({ id, currentPage }) => {
      await queryClient.cancelQueries({ queryKey: BOOKS_KEY });
      const prev = queryClient.getQueryData<BookWithCounts[]>(BOOKS_KEY);
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, old =>
        old?.map(b => b.id === id ? ({ ...b, currentPage } as BookWithCounts) : b)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(BOOKS_KEY, ctx.prev);
    },
    onSuccess: (book) => {
      queryClient.setQueryData<BookWithCounts[]>(BOOKS_KEY, old =>
        old?.map(b => b.id === book.id ? { ...b, ...book } : b)
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: BOOKS_KEY });
    },
  });
}

export function useUpdateBibliothecaSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<BibliothecaSettings>) => api.bibliothecaSettings.update(data),
    onSuccess: (settings) => {
      queryClient.setQueryData<BibliothecaSettings>(BIBLIOTHECA_SETTINGS_KEY, settings);
    },
  });
}

// ── Book Notes mutations ───────────────────────────────────────────────────────

export function useCreateBookNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: number; content: string; pageNumber?: number | null }) =>
      api.bookNotes.create(data),
    onSuccess: (note) => {
      queryClient.setQueryData<BookNote[]>(
        queryKeys.bookNotes(note.bookId),
        prev => [note, ...(prev ?? [])]
      );
    },
  });
}

export function useUpdateBookNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { content: string; pageNumber?: number | null } }) =>
      api.bookNotes.update(id, data),
    onSuccess: (note) => {
      queryClient.setQueryData<BookNote[]>(
        queryKeys.bookNotes(note.bookId),
        prev => prev?.map(n => n.id === note.id ? note : n)
      );
    },
  });
}

export function useDeleteBookNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: number; bookId: number }) =>
      api.bookNotes.delete(id).then(() => ({ id, bookId })),
    onSuccess: ({ id, bookId }) => {
      queryClient.setQueryData<BookNote[]>(
        queryKeys.bookNotes(bookId),
        prev => prev?.filter(n => n.id !== id)
      );
    },
  });
}

// ── Book Quotes mutations ──────────────────────────────────────────────────────

export function useCreateBookQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: number; text: string; pageNumber?: number | null }) =>
      api.bookQuotes.create(data),
    onSuccess: (quote) => {
      queryClient.setQueryData<BookQuote[]>(
        queryKeys.bookQuotes(quote.bookId),
        prev => [quote, ...(prev ?? [])]
      );
    },
  });
}

export function useDeleteBookQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: number; bookId: number }) =>
      api.bookQuotes.delete(id).then(() => ({ id, bookId })),
    onSuccess: ({ id, bookId }) => {
      queryClient.setQueryData<BookQuote[]>(
        queryKeys.bookQuotes(bookId),
        prev => prev?.filter(q => q.id !== id)
      );
    },
  });
}

// ── Book Learnings mutations ───────────────────────────────────────────────────

type LearningPayload = { bookId: number; term: string; definition: string; pageNumber?: number | null };
type LearningUpdatePayload = { id: number; bookId: number; data: { term: string; definition: string; pageNumber?: number | null } };

export function useCreateBookLearning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LearningPayload) => api.bookLearnings.create(data),
    onSuccess: (learning) => {
      queryClient.setQueryData<BookLearning[]>(
        queryKeys.bookLearnings({ bookId: learning.bookId }),
        prev => [learning, ...(prev ?? [])]
      );
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookLearnings({ bookId: vars.bookId }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookLearnings() });
    },
  });
}

export function useUpdateBookLearning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: LearningUpdatePayload) => api.bookLearnings.update(id, data),
    onSuccess: (learning) => {
      queryClient.setQueryData<BookLearning[]>(
        queryKeys.bookLearnings({ bookId: learning.bookId }),
        prev => prev?.map(l => l.id === learning.id ? learning : l)
      );
      queryClient.setQueryData<BookLearning[]>(
        queryKeys.bookLearnings(),
        prev => prev?.map(l => l.id === learning.id ? learning : l)
      );
    },
  });
}

export function useDeleteBookLearning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bookId }: { id: number; bookId: number }) =>
      api.bookLearnings.delete(id).then(() => ({ id, bookId })),
    onSuccess: ({ id, bookId }) => {
      queryClient.setQueryData<BookLearning[]>(
        queryKeys.bookLearnings({ bookId }),
        prev => prev?.filter(l => l.id !== id)
      );
      queryClient.setQueryData<BookLearning[]>(
        queryKeys.bookLearnings(),
        prev => prev?.filter(l => l.id !== id)
      );
    },
  });
}

// ── OpenLibrary search (mutation — never auto-runs) ────────────────────────────

export function useSearchOpenLibrary() {
  return useMutation({
    mutationFn: (query: string) => api.books.searchOpenLibrary(query),
  });
}

// ── AI mutations ───────────────────────────────────────────────────────────────

export function useExplainTerm() {
  return useMutation({
    mutationFn: (term: string) => api.ai.explainTerm(term),
  });
}

export function useQuizInsight() {
  return useMutation({
    mutationFn: (data: { score: number; total: number; missedTerms: { term: string; definition: string }[] }) =>
      api.ai.quizInsight(data),
  });
}

// ── Query hooks ────────────────────────────────────────────────────────────────

export function useBookStats() {
  return useQuery<BookStats>({
    queryKey: BOOK_STATS_KEY,
    queryFn: () => api.books.stats(),
    staleTime: 60_000,
  });
}

export function useBibliothecaSettingsQuery() {
  return useQuery<BibliothecaSettings>({
    queryKey: BIBLIOTHECA_SETTINGS_KEY,
    queryFn: () => api.bibliothecaSettings.get(),
    staleTime: 5 * 60_000,
  });
}

export function useBookNotes(bookId: number) {
  return useQuery<BookNote[]>({
    queryKey: queryKeys.bookNotes(bookId),
    queryFn: () => api.bookNotes.list(bookId),
    enabled: !!bookId,
  });
}

export function useBookQuotes(bookId: number) {
  return useQuery<BookQuote[]>({
    queryKey: queryKeys.bookQuotes(bookId),
    queryFn: () => api.bookQuotes.list(bookId),
    enabled: !!bookId,
  });
}

export function useBookQuoteRandom() {
  return useQuery({
    queryKey: queryKeys.bookQuoteRandom,
    queryFn: () => api.bookQuotes.random(),
    staleTime: Infinity,
  });
}

export function useBookLearnings(params?: { bookId?: number; search?: string }) {
  return useQuery<BookLearning[]>({
    queryKey: queryKeys.bookLearnings(params),
    queryFn: () => api.bookLearnings.list(params),
  });
}

// ── Composite hook for main Bibliotheca page ──────────────────────────────────

export function useBibliotheca() {
  const booksQuery    = useQuery<BookWithCounts[]>    ({ queryKey: BOOKS_KEY,                queryFn: () => api.books.list() });
  const statsQuery    = useQuery<BookStats>            ({ queryKey: BOOK_STATS_KEY,           queryFn: () => api.books.stats(),           staleTime: 60_000 });
  const settingsQuery = useQuery<BibliothecaSettings>  ({ queryKey: BIBLIOTHECA_SETTINGS_KEY, queryFn: () => api.bibliothecaSettings.get(), staleTime: 5 * 60_000 });

  return {
    books:    booksQuery.data    ?? ([] as BookWithCounts[]),
    stats:    statsQuery.data    ?? null,
    settings: settingsQuery.data ?? null,
    loading:  booksQuery.isLoading || statsQuery.isLoading || settingsQuery.isLoading,
  };
}

// ── Composite hook for book detail view ───────────────────────────────────────

export function useBookDetail(bookId: number) {
  const notesQuery     = useBookNotes(bookId);
  const quotesQuery    = useBookQuotes(bookId);
  const learningsQuery = useBookLearnings({ bookId });

  return {
    notes:          notesQuery.data     ?? ([] as BookNote[]),
    quotes:         quotesQuery.data    ?? ([] as BookQuote[]),
    learnings:      learningsQuery.data ?? ([] as BookLearning[]),
    contentLoading: notesQuery.isLoading || quotesQuery.isLoading || learningsQuery.isLoading,
  };
}
