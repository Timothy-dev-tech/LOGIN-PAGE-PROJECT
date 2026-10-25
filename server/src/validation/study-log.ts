import { HttpError } from '../utils/http-error.js';
import { asObject, check, failIfAny } from './helpers.js';
import type { ValidationResult } from './validators.js';

export const TOPIC_MIN_LENGTH = 2;
export const TOPIC_MAX_LENGTH = 80;
export const MINUTES_MIN = 1;
export const MINUTES_MAX = 1440; // one full day
export const NOTES_MAX_LENGTH = 500;
const EARLIEST_DATE = '2000-01-01';

export interface StudyLogInput {
  topic: string;
  minutes: number;
  studiedOn: string;
  notes: string;
}
export type StudyLogPatch = Partial<StudyLogInput>;

const ok = (): ValidationResult => ({ valid: true });
const fail = (message: string): ValidationResult => ({ valid: false, message });

/** Trim and collapse runs of spaces, the same way the rules judge it. */
export const tidy = (value: string): string => value.trim().replace(/\s+/g, ' ');

export function validateTopic(topic: string): ValidationResult {
  const value = tidy(topic);
  if (value === '') return fail('Topic is required');
  if (value.length < TOPIC_MIN_LENGTH) return fail(`Topic must be at least ${TOPIC_MIN_LENGTH} characters`);
  if (value.length > TOPIC_MAX_LENGTH) return fail(`Topic must be at most ${TOPIC_MAX_LENGTH} characters`);
  return ok();
}

export function validateNotes(notes: string): ValidationResult {
  if (notes.trim().length > NOTES_MAX_LENGTH) return fail(`Notes must be at most ${NOTES_MAX_LENGTH} characters`);
  return ok();
}

/**
 * The day is a plain "YYYY-MM-DD" string, not a timestamp. "I studied on 5 March" is a
 * calendar day, and a timestamp would shift it by hours between Nairobi (UTC+3) and a server
 * in another zone. Strings in this format also sort correctly as text.
 */
export function validateStudiedOn(value: string, now: Date = new Date()): ValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('Date must look like 2026-03-05');
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const real = new Date(Date.UTC(y, m - 1, d));
  // Date rolls 2026-02-30 over to March; a real date survives the round trip unchanged.
  if (real.toISOString().slice(0, 10) !== value) return fail('That date does not exist');
  if (value < EARLIEST_DATE) return fail('Date is too far in the past');
  // Allow "tomorrow" in UTC so someone ahead of UTC (like Nairobi) can log late at night.
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (value > tomorrow) return fail('Date cannot be in the future');
  return ok();
}

function readMinutes(errors: Record<string, string>, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.minutes = 'minutes must be a whole number';
    return 0;
  }
  if (value < MINUTES_MIN || value > MINUTES_MAX) {
    errors.minutes = `Minutes must be between ${MINUTES_MIN} and ${MINUTES_MAX}`;
    return 0;
  }
  return value;
}

export function parseStudyLogInput(body: unknown, now: Date = new Date()): StudyLogInput {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const topic = check(errors, 'topic', data.topic, validateTopic);
  const minutes = readMinutes(errors, data.minutes);
  const studiedOn = check(errors, 'studiedOn', data.studiedOn, (v) => validateStudiedOn(v, now));
  const notes = data.notes === undefined ? '' : check(errors, 'notes', data.notes, validateNotes);
  failIfAny(errors);
  // Only these four fields are ever read. The owner comes from the access token, never the body.
  return { topic: tidy(topic), minutes, studiedOn, notes: notes.trim() };
}

/** For PATCH: every field is optional, but at least one must be present and each must be valid. */
export function parseStudyLogPatch(body: unknown, now: Date = new Date()): StudyLogPatch {
  const data = asObject(body);
  const errors: Record<string, string> = {};
  const patch: StudyLogPatch = {};

  if (data.topic !== undefined) patch.topic = tidy(check(errors, 'topic', data.topic, validateTopic));
  if (data.minutes !== undefined) patch.minutes = readMinutes(errors, data.minutes);
  if (data.studiedOn !== undefined)
    patch.studiedOn = check(errors, 'studiedOn', data.studiedOn, (v) => validateStudiedOn(v, now));
  if (data.notes !== undefined) patch.notes = check(errors, 'notes', data.notes, validateNotes).trim();

  failIfAny(errors);
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, 'validation_failed', 'Send at least one of: topic, minutes, studiedOn, notes.');
  }
  return patch;
}