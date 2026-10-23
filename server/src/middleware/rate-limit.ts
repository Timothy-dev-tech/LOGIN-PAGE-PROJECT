import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError } from '../utils/http-error.js';

export interface LimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Limits how many requests one IP address can make in a time window. The error goes through
 * our normal error handler so the 429 has the same JSON shape as every other error.
 * Counters live in memory: fine for one server, and the first thing to change if we scaled
 * to several (they would need a shared store such as Redis).
 */
export function createRateLimiter(options: LimitOptions, skipSuccessful = false): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'too_many_requests', 'Too many attempts. Please try again later.'));
    },
  });
}