import { HttpError } from '../utils/http-error.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
}

function whole(value: unknown, fallback: number, field: string, errors: Record<string, string>) {
  if (value === undefined) return fallback;
  // Query strings can be arrays or objects (?page[]=1), so insist on a plain digit string.
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value) || Number(value) < 1) {
    errors[field] = `${field} must be a whole number of 1 or more`;
    return fallback;
  }
  return Number(value);
}

/** Reads ?page=2&limit=20. Defaults: page 1, 20 per page; the limit is capped at 100. */
export function parsePagination(query: unknown): Pagination {
  const q = typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : {};
  const errors: Record<string, string> = {};
  const page = whole(q.page, 1, 'page', errors);
  const limit = whole(q.limit, DEFAULT_LIMIT, 'limit', errors);
  if (limit > MAX_LIMIT) errors.limit = `limit must be at most ${MAX_LIMIT}`;
  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'validation_failed', 'Please fix the highlighted fields.', {
      fieldErrors: errors,
    });
  }
  return { page, limit };
}