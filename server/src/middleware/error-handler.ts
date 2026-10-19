import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Errors thrown by express.json() carry a `type` we can recognise. */
function bodyParserError(err: unknown): HttpError | null {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    return new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
  }
  if (type === 'entity.too.large') {
    return new HttpError(413, 'payload_too_large', 'The request body is too large.');
  }
  return null;
}

/**
 * The single place where every error becomes a response, so they all have the same
 * shape: { error: { code, message, details? } }. Anything we did not expect becomes a
 * generic 500 and the real error is only logged on the server, never sent to the client.
 * Express recognises an error handler by its four parameters, so `_next` must stay.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const known = err instanceof HttpError ? err : bodyParserError(err);

  if (known) {
    const body: ErrorBody = { error: { code: known.code, message: known.message } };
    if (known.details !== undefined) body.error.details = known.details;
    res.status(known.status).json(body);
    return;
  }

  console.error('Unhandled error:', err);
  const body: ErrorBody = {
    error: { code: 'internal_error', message: 'Something went wrong on our side.' },
  };
  res.status(500).json(body);
};