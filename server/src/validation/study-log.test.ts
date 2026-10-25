import { describe, expect, it } from 'vitest';
import { HttpError } from '../utils/http-error.js';
import { parsePagination } from './pagination.js';
import {
  parseStudyLogInput,
  parseStudyLogPatch,
  validateStudiedOn,
  validateTopic,
} from './study-log.js';

const now = new Date('2026-10-23T12:00:00Z');
const good = { topic: 'Express middleware', minutes: 45, studiedOn: '2026-10-23', notes: 'Read the docs' };

function fieldErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return (err.details as { fieldErrors?: Record<string, string> })?.fieldErrors ?? {};
    throw err;
  }
  throw new Error('expected a validation error');
}

describe('validateStudiedOn', () => {
  it('accepts today and tomorrow (UTC), rejects later', () => {
    expect(validateStudiedOn('2026-10-23', now).valid).toBe(true);
    expect(validateStudiedOn('2026-10-24', now).valid).toBe(true);
    expect(validateStudiedOn('2026-10-25', now)).toEqual({ valid: false, message: 'Date cannot be in the future' });
  });
  it('rejects dates that do not exist or are badly formatted', () => {
    expect(validateStudiedOn('2026-02-30', now).valid).toBe(false);
    expect(validateStudiedOn('2026-13-01', now).valid).toBe(false);
    expect(validateStudiedOn('23/10/2026', now).valid).toBe(false);
    expect(validateStudiedOn('1999-12-31', now).valid).toBe(false);
  });
});

describe('validateTopic', () => {
  it('trims and counts the cleaned text', () => {
    expect(validateTopic('   a   ').valid).toBe(false);
    expect(validateTopic('  JWT  ').valid).toBe(true);
    expect(validateTopic('x'.repeat(81)).valid).toBe(false);
  });
});

describe('parseStudyLogInput', () => {
  it('returns cleaned values and ignores unknown fields', () => {
    const out = parseStudyLogInput({ ...good, topic: '  Express   middleware ', user: 'someone', role: 'admin' }, now);
    expect(out).toEqual(good);
    expect(out).not.toHaveProperty('user');
  });
  it('defaults notes to an empty string', () => {
    expect(parseStudyLogInput({ ...good, notes: undefined }, now).notes).toBe('');
  });
  it('reports every bad field at once', () => {
    const errors = fieldErrors(() => parseStudyLogInput({ topic: '', minutes: '30', studiedOn: 'nope', notes: 5 }, now));
    expect(Object.keys(errors).sort()).toEqual(['minutes', 'notes', 'studiedOn', 'topic']);
  });
  it('requires whole minutes from 1 to 1440', () => {
    for (const minutes of [0, -5, 1441, 1.5, null, '30']) {
      expect(fieldErrors(() => parseStudyLogInput({ ...good, minutes }, now))).toHaveProperty('minutes');
    }
    expect(parseStudyLogInput({ ...good, minutes: 1440 }, now).minutes).toBe(1440);
  });
  it('treats a non-object body as missing fields', () => {
    expect(Object.keys(fieldErrors(() => parseStudyLogInput([1, 2], now))).sort()).toEqual(['minutes', 'studiedOn', 'topic']);
  });
});

describe('parseStudyLogPatch', () => {
  it('returns only the fields that were sent', () => {
    expect(parseStudyLogPatch({ minutes: 60 }, now)).toEqual({ minutes: 60 });
  });
  it('refuses an empty patch', () => {
    expect(() => parseStudyLogPatch({}, now)).toThrow(/at least one/);
    expect(() => parseStudyLogPatch({ user: 'x' }, now)).toThrow(/at least one/);
  });
  it('still validates what was sent', () => {
    expect(fieldErrors(() => parseStudyLogPatch({ topic: 'a' }, now))).toHaveProperty('topic');
  });
});

describe('parsePagination', () => {
  it('defaults to page 1, 20 per page', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20 });
  });
  it('reads numbers from the query string', () => {
    expect(parsePagination({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });
  it('rejects zero, negatives, text, arrays and limits over 100', () => {
    for (const q of [{ page: '0' }, { page: '-1' }, { page: 'abc' }, { page: ['1'] }, { limit: '101' }, { limit: '1.5' }]) {
      expect(() => parsePagination(q)).toThrow(HttpError);
    }
  });
});