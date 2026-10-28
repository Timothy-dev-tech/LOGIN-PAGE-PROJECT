import { describe, expect, it } from 'vitest';
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from './recovery-codes.js';

describe('generateRecoveryCodes', () => {
  it('makes 10 distinct codes shaped like abcde-fghij', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
  });
  it('never uses look-alike characters', () => {
    const text = generateRecoveryCodes(200).join('');
    expect(text).not.toMatch(/[ilo01]/);
  });
});

describe('normalizeRecoveryCode', () => {
  it('forgives case, spaces and a missing dash', () => {
    expect(normalizeRecoveryCode('ABCDE-FGHJK')).toBe('abcdefghjk');
    expect(normalizeRecoveryCode(' abcde fghjk ')).toBe('abcdefghjk');
    expect(normalizeRecoveryCode('abcdefghjk')).toBe('abcdefghjk');
  });
  it('rejects anything that cannot be a code', () => {
    for (const bad of ['', 'abcde', 'abcde-fghjkk', 'abcde-fghi1', 'abcde-fghjk!', '123456']) {
      expect(normalizeRecoveryCode(bad)).toBeNull();
    }
  });
});

describe('hashRecoveryCode', () => {
  it('is stable and hides the code', () => {
    const hash = hashRecoveryCode('abcdefghjk');
    expect(hash).toBe(hashRecoveryCode('abcdefghjk'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('abcdefghjk');
    expect(hashRecoveryCode('abcdefghjm')).not.toBe(hash);
  });
});