import type { ErrorRequestHandler } from 'express';
import { CompletionError } from '../db/completion';

export const completionError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof CompletionError) res.status(error.status).json({ error: error.code });
  else res.status(503).json({ error: 'Completion unavailable. Try again later.' });
};
