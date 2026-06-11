import { Router } from 'express';
import { db } from '../db/database';
import type { BookStatus } from '../types';

const booksRouter = Router();
const bookNotesRouter = Router();
const bookQuotesRouter = Router();
const bookLearningsRouter = Router();
const bibliothecaSettingsRouter = Router();

const VALID_STATUSES: BookStatus[] = ['reading', 'finished', 'want-to-read', 'dnf'];

// Only accept cover URLs from the OpenLibrary CDN to avoid storing arbitrary external URLs
function safeCoverUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'covers.openlibrary.org' ? value : null;
  } catch { return null; }
}

// ── Books ─────────────────────────────────────────────────────────────────────

// GET /api/books/stats — before /:id to avoid param capture
booksRouter.get('/stats', (_req, res) => {
  res.json(db.getBookStats());
});

// POST /api/books/search-open-library — before /:id
booksRouter.post('/search-open-library', async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query.trim())}&limit=8&fields=title,author_name,cover_i,key,number_of_pages_median`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) { res.json([]); return; }
    const data = await resp.json() as { docs?: Record<string, unknown>[] };
    const results = (data.docs ?? []).map((doc) => ({
      title: String(doc.title ?? ''),
      author: Array.isArray(doc.author_name) ? String(doc.author_name[0] ?? '') : '',
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      openLibraryKey: doc.key ? String(doc.key) : null,
      totalPages: typeof doc.number_of_pages_median === 'number' ? doc.number_of_pages_median : null,
    }));
    res.json(results);
  } catch {
    res.json([]);
  }
});

// GET /api/books
booksRouter.get('/', (req, res) => {
  const { status, search } = req.query;
  res.json(db.getBooks({
    status: status ? String(status) as BookStatus : undefined,
    search: search ? String(search) : undefined,
  }));
});

// POST /api/books
booksRouter.post('/', (req, res) => {
  const { title, author, status, coverUrl, openLibraryKey, totalPages, currentPage, rating, genre, tags, synopsis, dnfReason, recommendedBy, startedAt, finishedAt } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required' }); return;
  }
  if (!author || typeof author !== 'string' || !author.trim()) {
    res.status(400).json({ error: 'author is required' }); return;
  }
  if (status && !VALID_STATUSES.includes(status as BookStatus)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }); return;
  }
  const book = db.createBook({
    title: title.trim(),
    author: String(author).trim(),
    status: (status as BookStatus) ?? 'want-to-read',
    coverUrl: safeCoverUrl(coverUrl),
    openLibraryKey: openLibraryKey ? String(openLibraryKey) : null,
    totalPages: typeof totalPages === 'number' ? totalPages : null,
    currentPage: typeof currentPage === 'number' ? currentPage : 0,
    rating: typeof rating === 'number' ? rating : null,
    genre: genre ? String(genre).trim() || null : null,
    tags: Array.isArray(tags) ? tags.map(String) : [],
    synopsis: synopsis ? String(synopsis).trim() || null : null,
    dnfReason: dnfReason ? String(dnfReason).trim() || null : null,
    recommendedBy: recommendedBy ? String(recommendedBy).trim() || null : null,
    startedAt: startedAt ? String(startedAt) : null,
    finishedAt: finishedAt ? String(finishedAt) : null,
    wantToReadOrder: 0,
  });
  res.status(201).json(book);
});

// GET /api/books/:id
booksRouter.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const book = db.getBook(id);
  if (!book) { res.status(404).json({ error: 'not found' }); return; }
  res.json(book);
});

// PATCH /api/books/:id
booksRouter.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const { status } = req.body;
  if (status !== undefined && !VALID_STATUSES.includes(status as BookStatus)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }); return;
  }
  // Whitelist updatable fields — never pass req.body straight through (mass assignment)
  const ALLOWED_FIELDS = ['title', 'author', 'status', 'coverUrl', 'openLibraryKey', 'totalPages', 'currentPage', 'rating', 'genre', 'tags', 'synopsis', 'dnfReason', 'recommendedBy', 'startedAt', 'finishedAt'] as const;
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in req.body) updates[field] = req.body[field];
  }
  if ('coverUrl' in updates) updates.coverUrl = safeCoverUrl(updates.coverUrl);
  const book = db.updateBook(id, updates);
  if (!book) { res.status(404).json({ error: 'not found' }); return; }
  res.json(book);
});

// DELETE /api/books/:id
booksRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteBook(id)) { res.status(404).json({ error: 'not found' }); return; }
  res.status(204).end();
});

// ── Book Notes ─────────────────────────────────────────────────────────────────

// GET /api/book-notes?bookId=X
bookNotesRouter.get('/', (req, res) => {
  const bookId = req.query.bookId ? parseInt(String(req.query.bookId), 10) : NaN;
  if (isNaN(bookId)) { res.status(400).json({ error: 'bookId is required' }); return; }
  res.json(db.getBookNotes(bookId));
});

// POST /api/book-notes
bookNotesRouter.post('/', (req, res) => {
  const { bookId, content, pageNumber } = req.body;
  if (!bookId || typeof bookId !== 'number') { res.status(400).json({ error: 'bookId is required' }); return; }
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' }); return;
  }
  const note = db.createBookNote({
    bookId,
    content: content.trim(),
    pageNumber: typeof pageNumber === 'number' ? pageNumber : null,
  });
  res.status(201).json(note);
});

// PATCH /api/book-notes/:id
bookNotesRouter.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const note = db.updateBookNote(id, req.body);
  if (!note) { res.status(404).json({ error: 'not found' }); return; }
  res.json(note);
});

// DELETE /api/book-notes/:id
bookNotesRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteBookNote(id)) { res.status(404).json({ error: 'not found' }); return; }
  res.status(204).end();
});

// ── Book Quotes ────────────────────────────────────────────────────────────────

// GET /api/book-quotes/random — before /:id
bookQuotesRouter.get('/random', (_req, res) => {
  const quote = db.getRandomBookQuote();
  res.json(quote ?? null);
});

// GET /api/book-quotes?bookId=X
bookQuotesRouter.get('/', (req, res) => {
  const bookId = req.query.bookId ? parseInt(String(req.query.bookId), 10) : NaN;
  if (isNaN(bookId)) { res.status(400).json({ error: 'bookId is required' }); return; }
  res.json(db.getBookQuotes(bookId));
});

// POST /api/book-quotes
bookQuotesRouter.post('/', (req, res) => {
  const { bookId, text, pageNumber } = req.body;
  if (!bookId || typeof bookId !== 'number') { res.status(400).json({ error: 'bookId is required' }); return; }
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' }); return;
  }
  const quote = db.createBookQuote({
    bookId,
    text: text.trim(),
    pageNumber: typeof pageNumber === 'number' ? pageNumber : null,
  });
  res.status(201).json(quote);
});

// DELETE /api/book-quotes/:id
bookQuotesRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteBookQuote(id)) { res.status(404).json({ error: 'not found' }); return; }
  res.status(204).end();
});

// ── Book Learnings ─────────────────────────────────────────────────────────────

// GET /api/book-learnings?bookId=X&search=Y
bookLearningsRouter.get('/', (req, res) => {
  const bookId = req.query.bookId ? parseInt(String(req.query.bookId), 10) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  res.json(db.getBookLearnings({ bookId: bookId && !isNaN(bookId) ? bookId : undefined, search }));
});

// POST /api/book-learnings
bookLearningsRouter.post('/', (req, res) => {
  const { bookId, term, definition, pageNumber } = req.body;
  if (!bookId || typeof bookId !== 'number') { res.status(400).json({ error: 'bookId is required' }); return; }
  if (!term || typeof term !== 'string' || !term.trim()) {
    res.status(400).json({ error: 'term is required' }); return;
  }
  if (!definition || typeof definition !== 'string' || !definition.trim()) {
    res.status(400).json({ error: 'definition is required' }); return;
  }
  const learning = db.createBookLearning({
    bookId,
    term: term.trim(),
    definition: definition.trim(),
    pageNumber: typeof pageNumber === 'number' ? pageNumber : null,
  });
  res.status(201).json(learning);
});

// PATCH /api/book-learnings/:id
bookLearningsRouter.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const learning = db.updateBookLearning(id, req.body);
  if (!learning) { res.status(404).json({ error: 'not found' }); return; }
  res.json(learning);
});

// DELETE /api/book-learnings/:id
bookLearningsRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteBookLearning(id)) { res.status(404).json({ error: 'not found' }); return; }
  res.status(204).end();
});

// ── Bibliotheca Settings ───────────────────────────────────────────────────────

// GET /api/bibliotheca-settings
bibliothecaSettingsRouter.get('/', (_req, res) => {
  res.json(db.getBibliothecaSettings());
});

// PATCH /api/bibliotheca-settings
bibliothecaSettingsRouter.patch('/', (req, res) => {
  const { yearlyGoal, currentYear } = req.body;
  const fields: Parameters<typeof db.updateBibliothecaSettings>[0] = {};
  if (yearlyGoal !== undefined) {
    if (typeof yearlyGoal !== 'number' || !Number.isInteger(yearlyGoal) || yearlyGoal < 0) {
      res.status(400).json({ error: 'yearlyGoal must be a non-negative integer' }); return;
    }
    fields.yearlyGoal = yearlyGoal;
  }
  if (currentYear !== undefined) {
    if (typeof currentYear !== 'number' || !Number.isInteger(currentYear)) {
      res.status(400).json({ error: 'currentYear must be an integer' }); return;
    }
    fields.currentYear = currentYear;
  }
  res.json(db.updateBibliothecaSettings(fields));
});

export { booksRouter, bookNotesRouter, bookQuotesRouter, bookLearningsRouter, bibliothecaSettingsRouter };
