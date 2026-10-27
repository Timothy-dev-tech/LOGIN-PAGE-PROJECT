// The browser's copy of the study-log rules in server/src/validation/study-log.ts. These help
// people fix mistakes before sending; the server checks again and has the final say.
import type { ValidationResult } from './validators';

export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 80;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 1440;
export const NOTES_MAX_LENGTH = 500;

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

/** Trim and collapse runs of spaces, the same way the server does before it judges the text. */
export const tidy = (value: string): string => value.trim().replace(/\s+/g, ' ');

export function validateTopic(topic: string): ValidationResult {
  const value = tidy(topic);
  if (value === '') return fail('Topic is required');
  if (value.length < TOPIC_MIN_LENGTH) return fail(`Topic must be at least ${TOPIC_MIN_LENGTH} characters`);
  if (value.length > TOPIC_MAX_LENGTH) return fail(`Topic must be at most ${TOPIC_MAX_LENGTH} characters`);
  return ok();
}

/** The field holds text ("45"), so check it is a whole number before checking the range. */
export function validateMinutes(text: string): ValidationResult {
  const value = text.trim();
  if (value === '') return fail('Minutes are required');
  if (!/^\d+$/.test(value)) return fail('Enter a whole number of minutes');
  const minutes = Number(value);
  if (minutes < MINUTES_MIN || minutes > MINUTES_MAX) {
    return fail(`Minutes must be between ${MINUTES_MIN} and ${MINUTES_MAX}`);
  }
  return ok();
}

/** `today` is the person's own calendar day, passed in so the rule can be tested. */
export function validateDay(day: string, today: string): ValidationResult {
  if (day === '') return fail('Date is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('Date must look like 2026-03-05');
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  if (new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) !== day) return fail('That date does not exist');
  if (day < '2000-01-01') return fail('Date is too far in the past');
  if (day > today) return fail('Date cannot be in the future');
  return ok();
}

export function validateNotes(notes: string): ValidationResult {
  if (notes.trim().length > NOTES_MAX_LENGTH) return fail(`Notes must be at most ${NOTES_MAX_LENGTH} characters`);
  return ok();
}