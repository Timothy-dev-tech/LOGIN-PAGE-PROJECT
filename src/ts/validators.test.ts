import { describe, expect, it } from 'vitest';
import {
  getPasswordRules,
  validateConfirmPassword,
  validateEmail,
  validateLoginPassword,
  validateName,
  validatePassword,
  validateTermsAccepted,
} from './validators';

describe('validateEmail', () => {
  it.each([
    'tim@example.com',
    'a.b+c@sub.example.co.ke',
    '  tim@example.com  ',
  ])('accepts %s', (email) => {
    expect(validateEmail(email)).toEqual({ valid: true });
  });

  it.each([
    ['', 'Email is required'],
    ['   ', 'Email is required'],
    ['plainaddress', 'Please enter a valid email'],
    ['a@b', 'Please enter a valid email'],
    ['a@b.c', 'Please enter a valid email'],
    ['two words@example.com', 'Please enter a valid email'],
    ['a@@example.com', 'Please enter a valid email'],
  ])('rejects "%s"', (email, message) => {
    expect(validateEmail(email)).toEqual({ valid: false, message });
  });

  it('rejects an email longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(validateEmail(long)).toEqual({
      valid: false,
      message: 'Email is too long',
    });
  });
});

describe('validatePassword', () => {
  it('accepts a password with letters and numbers', () => {
    expect(validatePassword('abcdefg1')).toEqual({ valid: true });
  });

  it('rejects an empty password', () => {
    expect(validatePassword('')).toEqual({
      valid: false,
      message: 'Password is required',
    });
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(validatePassword('abc123')).toEqual({
      valid: false,
      message: 'Password must be at least 8 characters',
    });
  });

  it.each(['abcdefgh', '12345678'])(
    'rejects "%s" (needs a letter and a number)',
    (pw) => {
      expect(validatePassword(pw)).toEqual({
        valid: false,
        message: 'Password must contain at least one letter and one number',
      });
    },
  );

  it('accepts exactly 72 bytes and rejects 73', () => {
    expect(validatePassword(`a1${'x'.repeat(70)}`)).toEqual({ valid: true });
    expect(validatePassword(`a1${'x'.repeat(71)}`)).toEqual({
      valid: false,
      message: 'Password is too long',
    });
  });

  it('counts bytes, not characters (emoji are 4 bytes each)', () => {
    expect(validatePassword(`a1${'😀'.repeat(18)}`)).toEqual({
      valid: false,
      message: 'Password is too long',
    });
  });
});

describe('validateLoginPassword', () => {
  it('accepts any non-empty password', () => {
    expect(validateLoginPassword('x')).toEqual({ valid: true });
  });

  it('rejects an empty password', () => {
    expect(validateLoginPassword('')).toEqual({
      valid: false,
      message: 'Password is required',
    });
  });
});

describe('validateConfirmPassword', () => {
  it('accepts matching passwords', () => {
    expect(validateConfirmPassword('abc12345', 'abc12345')).toEqual({
      valid: true,
    });
  });

  it('rejects an empty confirmation', () => {
    expect(validateConfirmPassword('abc12345', '')).toEqual({
      valid: false,
      message: 'Please confirm your password',
    });
  });

  it('rejects a mismatch', () => {
    expect(validateConfirmPassword('abc12345', 'abc12346')).toEqual({
      valid: false,
      message: 'Passwords do not match',
    });
  });
});
describe('validateName', () => {
  it.each(['Timothy', 'Wanjiru Kamau', "O'Brien", 'Mary-Jane', 'St. John', 'Müller', 'Nguyễn Văn An'])(
    'accepts %s',
    (name) => {
      expect(validateName(name)).toEqual({ valid: true });
    },
  );

  it('ignores extra spaces around and inside the name', () => {
    expect(validateName('  Wanjiru    Kamau  ')).toEqual({ valid: true });
  });

  it.each([
    ['', 'Full name is required'],
    ['   ', 'Full name is required'],
    ['A', 'Name must be at least 2 characters'],
    ['Tim3', 'Name can only contain letters, spaces, apostrophes, dots and hyphens'],
    ['<script>', 'Name can only contain letters, spaces, apostrophes, dots and hyphens'],
    ['-Tim', 'Name can only contain letters, spaces, apostrophes, dots and hyphens'],
  ])('rejects "%s"', (name, message) => {
    expect(validateName(name)).toEqual({ valid: false, message });
  });

  it('rejects a name longer than 60 characters', () => {
    expect(validateName('a'.repeat(61))).toEqual({
      valid: false,
      message: 'Name must be at most 60 characters',
    });
  });
});

describe('validateTermsAccepted', () => {
  it('accepts when ticked', () => {
    expect(validateTermsAccepted(true)).toEqual({ valid: true });
  });

  it('rejects when not ticked', () => {
    expect(validateTermsAccepted(false)).toEqual({
      valid: false,
      message: 'You must agree to continue',
    });
  });
});

describe('getPasswordRules', () => {
  it('reports each rule separately', () => {
    expect(getPasswordRules('abc')).toEqual({
      minLength: false,
      hasLetterAndNumber: false,
      withinMaxBytes: true,
    });
    expect(getPasswordRules('abcdefg1')).toEqual({
      minLength: true,
      hasLetterAndNumber: true,
      withinMaxBytes: true,
    });
    expect(getPasswordRules(`a1${'x'.repeat(71)}`).withinMaxBytes).toBe(false);
  });
});