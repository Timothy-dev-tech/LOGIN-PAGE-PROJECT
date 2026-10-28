import { describe, expect, it } from 'vitest';
import {
  factorBody,
  groupSecret,
  tidyAppCode,
  tidyRecoveryCode,
  validateAppCode,
  validateFactor,
  validateRecoveryCode,
} from './two-factor-validators';

describe('app code', () => {
  it('accepts 6 digits, with or without a space', () => {
    expect(validateAppCode('123456').valid).toBe(true);
    expect(validateAppCode('123 456').valid).toBe(true);
    expect(tidyAppCode(' 123 456 ')).toBe('123456');
  });
  it('explains what is wrong', () => {
    expect(validateAppCode('')).toEqual({ valid: false, message: 'Enter the 6-digit code from your app' });
    for (const bad of ['12345', '1234567', 'abcdef', '12-3456']) expect(validateAppCode(bad).valid).toBe(false);
  });
});

describe('recovery code', () => {
  it('accepts the shown form and sloppy versions of it', () => {
    for (const good of ['abcde-fghjk', 'ABCDE-FGHJK', 'abcde fghjk', 'abcdefghjk']) {
      expect(validateRecoveryCode(good).valid).toBe(true);
    }
    expect(tidyRecoveryCode('ABCDE-fghjk')).toBe('abcdefghjk');
  });
  it('rejects empty, short and symbol-filled input', () => {
    for (const bad of ['', 'abcde', 'abcde-fghj!', 'abcde-fghjkk']) expect(validateRecoveryCode(bad).valid).toBe(false);
  });
});

describe('helpers', () => {
  it('validateFactor picks the rule by mode', () => {
    expect(validateFactor('123456', 'app').valid).toBe(true);
    expect(validateFactor('123456', 'recovery').valid).toBe(false);
    expect(validateFactor('abcde-fghjk', 'recovery').valid).toBe(true);
  });
  it('factorBody builds the right field', () => {
    expect(factorBody('123 456', 'app')).toEqual({ code: '123456' });
    expect(factorBody('ABCDE-FGHJK', 'recovery')).toEqual({ recoveryCode: 'abcdefghjk' });
  });
  it('groupSecret splits into fours', () => {
    expect(groupSecret('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
    expect(groupSecret('ABCDEF')).toBe('ABCD EF');
  });
});