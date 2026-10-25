import { HttpError } from '../utils/http-error.js';
import type { ValidationResult } from './validators.js';

// Small building blocks shared by every request parser (auth, study log, pagination).

/** JSON can hold anything, so check the type before the rules. */
export function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Runs a text rule on one field; records the message in `errors` if it fails. */
export function check(
  errors: Record<string, string>,
  field: string,
  value: unknown,
  rule: (v: string) => ValidationResult,
): string {
  const str = text(value);
  if (str === null) {
    errors[field] = `${field} must be text`;
    return '';
  }
  const result = rule(str);
  if (!result.valid) errors[field] = result.message;
  return str;
}

/** Throws one 400 that lists every field that failed, so the page can mark them all. */
export function failIfAny(errors: Record<string, string>): void {
  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'validation_failed', 'Please fix the highlighted fields.', {
      fieldErrors: errors,
    });
  }
}

/** A request body that is not a plain object (a list, a number, null) counts as "no fields". */
export function asObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}