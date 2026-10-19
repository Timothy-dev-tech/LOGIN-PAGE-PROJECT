import type { RequestHandler } from 'express';
import { HttpError } from '../utils/http-error.js';

/** Runs when no route matched. Hands a 404 to the error handler. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'not_found', `No route for ${req.method} ${req.path}`));
};