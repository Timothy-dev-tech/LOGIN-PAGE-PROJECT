import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validatePassword,
} from './validators.js';

// These cases are copied from the frontend tests (src/ts/validators.test.ts) on purpose:
// the server mirrors the browser rules, and the same inputs must give the same answers.
const valid = (r: { valid: boolean }) => r.valid;

describe('validateEmail (mirrors the frontend)', () => {
  it.each(['tim@example.com', '  tim@example.com  ', 'a.b+c@sub.example.co.ke'])('accepts %j', (e) => {
    expect(valid(validateEmail(e))).toBe(true);
  });
  it.each(['', '   ', 'tim', 'tim@', '@example.com', 'tim@example', 'tim @example.com', 'a'.repeat(250) + '@x.com'])(
    'rejects %j',
    (e) => {
      expect(valid(validateEmail(e))).toBe(false);
    },
  );
  it('normalizes to trimmed lowercase', () => {
    expect(normalizeEmail('  Tim@Example.COM ')).toBe('tim@example.com');
  });
});

describe('validatePassword (mirrors the frontend)', () => {
  it.each(['abcdefg1', 'Password123', 'pässword1'])('accepts %j', (p) => {
    expect(valid(validatePassword(p))).toBe(true);
  });
  it.each(['', 'abc1', 'abcdefgh', '12345678'])('rejects %j', (p) => {
    expect(valid(validatePassword(p))).toBe(false);
  });
  it('rejects more than 72 bytes even when under 72 characters', () => {
    expect(valid(validatePassword('a1' + 'é'.repeat(36)))).toBe(false); // 74 bytes, 38 characters
    expect(valid(validatePassword('a1' + 'x'.repeat(70)))).toBe(true); // exactly 72 bytes
    expect(valid(validatePassword('a1' + 'x'.repeat(71)))).toBe(false);
  });
});

describe('validateName (mirrors the frontend)', () => {
  it.each(['Tim', 'Wanjiru Kamau', "O'Brien", 'Mary-Jane', 'Nguyễn Văn', 'Müller', 'St. John'])('accepts %j', (n) => {
    expect(valid(validateName(n))).toBe(true);
  });
  it.each(['', ' ', 'T', '1234', '-Tim', 'Tim<script>', 'a'.repeat(61)])('rejects %j', (n) => {
    expect(valid(validateName(n))).toBe(false);
  });
  it('collapses extra spaces', () => {
    expect(normalizeName('  Tim    Sol  ')).toBe('Tim Sol');
  });
});