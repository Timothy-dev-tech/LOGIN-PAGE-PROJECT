import { describe, expect, it } from 'vitest';
import { tidy, validateDay, validateMinutes, validateNotes, validateTopic } from './study-validators';

const bad = (message: string) => ({ valid: false, message });

describe('validateTopic', () => {
  it('needs 2 to 80 characters after tidying', () => {
    expect(validateTopic('')).toEqual(bad('Topic is required'));
    expect(validateTopic('   ')).toEqual(bad('Topic is required'));
    expect(validateTopic(' a ')).toEqual(bad('Topic must be at least 2 characters'));
    expect(validateTopic('JWT')).toEqual({ valid: true });
    expect(validateTopic('x'.repeat(81))).toEqual(bad('Topic must be at most 80 characters'));
  });
});

describe('tidy', () => {
  it('trims and collapses spaces', () => {
    expect(tidy('  Express   middleware ')).toBe('Express middleware');
  });
});

describe('validateMinutes', () => {
  it('accepts whole numbers from 1 to 1440', () => {
    expect(validateMinutes('1')).toEqual({ valid: true });
    expect(validateMinutes(' 45 ')).toEqual({ valid: true });
    expect(validateMinutes('1440')).toEqual({ valid: true });
  });
  it('refuses empty, decimals, negatives, text and out-of-range', () => {
    expect(validateMinutes('')).toEqual(bad('Minutes are required'));
    for (const text of ['1.5', '-5', 'abc', '1e3', '4 5']) {
      expect(validateMinutes(text)).toEqual(bad('Enter a whole number of minutes'));
    }
    expect(validateMinutes('0')).toEqual(bad('Minutes must be between 1 and 1440'));
    expect(validateMinutes('1441')).toEqual(bad('Minutes must be between 1 and 1440'));
  });
});

describe('validateDay', () => {
  const today = '2026-10-25';
  it('accepts today and earlier', () => {
    expect(validateDay('2026-10-25', today)).toEqual({ valid: true });
    expect(validateDay('2026-01-01', today)).toEqual({ valid: true });
  });
  it('refuses the future, impossible dates and bad formats', () => {
    expect(validateDay('2026-10-26', today)).toEqual(bad('Date cannot be in the future'));
    expect(validateDay('2026-02-30', today)).toEqual(bad('That date does not exist'));
    expect(validateDay('25/10/2026', today)).toEqual(bad('Date must look like 2026-03-05'));
    expect(validateDay('', today)).toEqual(bad('Date is required'));
    expect(validateDay('1999-12-31', today)).toEqual(bad('Date is too far in the past'));
  });
});

describe('validateNotes', () => {
  it('allows empty notes and caps the length', () => {
    expect(validateNotes('')).toEqual({ valid: true });
    expect(validateNotes('x'.repeat(500))).toEqual({ valid: true });
    expect(validateNotes('x'.repeat(501))).toEqual(bad('Notes must be at most 500 characters'));
  });
});